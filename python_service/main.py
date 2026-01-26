from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import List, Optional
import polars as pl
import pandas as pd
import json
import io
import tempfile
import os

app = FastAPI(title="Ecovis Transformation Service")

def load_file_to_polars(file_content: bytes, filename: str) -> pl.DataFrame:
    """Load a file (CSV, Excel, TXT) into a Polars DataFrame"""
    file_ext = filename.lower().split('.')[-1]
    
    if file_ext == 'csv':
        return pl.read_csv(io.BytesIO(file_content), infer_schema_length=10000)
    elif file_ext in ['xlsx', 'xls']:
        pdf = pd.read_excel(io.BytesIO(file_content))
        return pl.from_pandas(pdf)
    elif file_ext == 'txt':
        try:
            return pl.read_csv(io.BytesIO(file_content), separator='\t', infer_schema_length=10000)
        except:
            return pl.read_csv(io.BytesIO(file_content), separator=';', infer_schema_length=10000)
    else:
        raise ValueError(f"Unsupported file format: {file_ext}")

def apply_transformation(df: pl.DataFrame, step: dict, all_dataframes: dict) -> pl.DataFrame:
    """Apply a single transformation step to a DataFrame"""
    step_type = step.get('type')
    config = step.get('config', {})
    
    if step_type == 'remove_column':
        columns = config.get('columns', [])
        if not columns:
            column = config.get('column')
            if column:
                columns = [column]
        existing_cols = [c for c in columns if c in df.columns]
        if existing_cols:
            df = df.drop(existing_cols)
    
    elif step_type == 'add_column':
        column_name = config.get('columnName', '')
        default_value = config.get('defaultValue', '')
        if column_name:
            df = df.with_columns(pl.lit(default_value).alias(column_name))
    
    elif step_type == 'rename_column':
        old_name = config.get('oldName', '')
        new_name = config.get('newName', '')
        if old_name and new_name and old_name in df.columns:
            df = df.rename({old_name: new_name})
    
    elif step_type == 'merge_columns':
        columns = config.get('columns', [])
        new_name = config.get('newName', '')
        separator = config.get('separator', '')
        if columns and new_name:
            existing_cols = [c for c in columns if c in df.columns]
            if existing_cols:
                merged = pl.concat_str([pl.col(c).cast(pl.Utf8) for c in existing_cols], separator=separator)
                df = df.with_columns(merged.alias(new_name))
    
    elif step_type == 'split_column':
        column = config.get('column', '')
        separator = config.get('separator', '')
        new_columns = config.get('newColumns', [])
        if column and separator and new_columns and column in df.columns:
            for i, new_col in enumerate(new_columns):
                if new_col:
                    df = df.with_columns(
                        pl.col(column).cast(pl.Utf8).str.split(separator).list.get(i, null_on_oob=True).alias(new_col)
                    )
    
    elif step_type == 'remove_text':
        column = config.get('column', '')
        text_to_remove = config.get('textToRemove', '')
        if column and text_to_remove and column in df.columns:
            df = df.with_columns(
                pl.col(column).cast(pl.Utf8).str.replace_all(text_to_remove, '').alias(column)
            )
    
    elif step_type == 'filter_rows':
        column = config.get('column', '')
        operator = config.get('operator', '')
        value = config.get('value', '')
        if column and operator and column in df.columns:
            col_expr = pl.col(column)
            try:
                numeric_value = float(value)
                is_numeric = True
            except:
                is_numeric = False
                numeric_value = None
            
            if operator == 'equals':
                if is_numeric:
                    df = df.filter(col_expr.cast(pl.Float64, strict=False) == numeric_value)
                else:
                    df = df.filter(col_expr.cast(pl.Utf8) == value)
            elif operator == 'not_equals':
                if is_numeric:
                    df = df.filter(col_expr.cast(pl.Float64, strict=False) != numeric_value)
                else:
                    df = df.filter(col_expr.cast(pl.Utf8) != value)
            elif operator == 'contains':
                df = df.filter(col_expr.cast(pl.Utf8).str.contains(value, literal=True))
            elif operator == 'not_contains':
                df = df.filter(~col_expr.cast(pl.Utf8).str.contains(value, literal=True))
            elif operator == 'greater_than' and is_numeric:
                df = df.filter(col_expr.cast(pl.Float64, strict=False) > numeric_value)
            elif operator == 'less_than' and is_numeric:
                df = df.filter(col_expr.cast(pl.Float64, strict=False) < numeric_value)
            elif operator == 'is_empty':
                df = df.filter(col_expr.is_null() | (col_expr.cast(pl.Utf8) == ''))
            elif operator == 'is_not_empty':
                df = df.filter(col_expr.is_not_null() & (col_expr.cast(pl.Utf8) != ''))
    
    elif step_type == 'conditional':
        source_column = config.get('sourceColumn', '')
        condition = config.get('condition', 'contains')
        search_value = config.get('searchValue', '')
        target_type = config.get('targetType', 'existing')
        target_column = config.get('targetColumn', '')
        then_value = config.get('thenValue', '')
        else_value = config.get('elseValue', '')
        
        if source_column and target_column and source_column in df.columns:
            col_expr = pl.col(source_column).cast(pl.Utf8)
            
            if condition == 'contains':
                condition_expr = col_expr.str.contains(search_value, literal=True)
            elif condition == 'equals':
                condition_expr = col_expr == search_value
            elif condition == 'not_contains':
                condition_expr = ~col_expr.str.contains(search_value, literal=True)
            elif condition == 'not_equals':
                condition_expr = col_expr != search_value
            elif condition == 'starts_with':
                condition_expr = col_expr.str.starts_with(search_value)
            elif condition == 'ends_with':
                condition_expr = col_expr.str.ends_with(search_value)
            elif condition == 'is_empty':
                condition_expr = col_expr.is_null() | (col_expr == '')
            elif condition == 'is_not_empty':
                condition_expr = col_expr.is_not_null() & (col_expr != '')
            else:
                condition_expr = col_expr.str.contains(search_value, literal=True)
            
            if else_value:
                result_expr = pl.when(condition_expr).then(pl.lit(then_value)).otherwise(pl.lit(else_value))
            else:
                if target_type == 'new' or target_column not in df.columns:
                    result_expr = pl.when(condition_expr).then(pl.lit(then_value)).otherwise(pl.lit(''))
                else:
                    result_expr = pl.when(condition_expr).then(pl.lit(then_value)).otherwise(pl.col(target_column).cast(pl.Utf8))
            
            df = df.with_columns(result_expr.alias(target_column))
    
    elif step_type == 'match_files':
        source_file = config.get('sourceFile', '')
        target_file = config.get('targetFile', '')
        source_column = config.get('sourceColumn', '')
        target_column = config.get('targetColumn', '')
        
        if source_file and target_file and source_column and target_column:
            if target_file in all_dataframes and source_column in df.columns:
                target_df = all_dataframes[target_file]
                if target_column in target_df.columns:
                    df = df.join(target_df, left_on=source_column, right_on=target_column, how='left')
    
    return df

@app.post("/transform")
async def transform_data(
    files: List[UploadFile] = File(...),
    file_slots: str = Form(...),
    transformation_steps: str = Form(...)
):
    """
    Transform uploaded files according to the specified transformation steps.
    
    - files: List of uploaded files
    - file_slots: JSON string mapping slot IDs to file indices
    - transformation_steps: JSON array of transformation steps
    """
    try:
        slots = json.loads(file_slots)
        steps = json.loads(transformation_steps)
        
        dataframes = {}
        file_names = {}
        
        for i, file in enumerate(files):
            content = await file.read()
            slot_id = None
            for sid, idx in slots.items():
                if idx == i:
                    slot_id = sid
                    break
            
            if slot_id:
                df = load_file_to_polars(content, file.filename)
                dataframes[slot_id] = df
                file_names[slot_id] = file.filename
        
        if not dataframes:
            raise HTTPException(status_code=400, detail="No valid files uploaded")
        
        primary_slot = list(dataframes.keys())[0]
        result_df = dataframes[primary_slot]
        
        for step in steps:
            result_df = apply_transformation(result_df, step, dataframes)
        
        output = io.BytesIO()
        result_df.write_csv(output)
        output.seek(0)
        csv_content = output.getvalue().decode('utf-8')
        
        rows_data = result_df.to_dicts()
        
        return JSONResponse({
            "success": True,
            "columns": result_df.columns,
            "row_count": len(result_df),
            "data": rows_data[:1000],
            "csv_content": csv_content
        })
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transformation error: {str(e)}")

@app.post("/preview-columns")
async def preview_columns(file: UploadFile = File(...)):
    """Get column names from an uploaded file for preview"""
    try:
        content = await file.read()
        df = load_file_to_polars(content, file.filename)
        
        sample_data = df.head(5).to_dicts()
        
        return JSONResponse({
            "success": True,
            "columns": df.columns,
            "row_count": len(df),
            "sample_data": sample_data
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Preview error: {str(e)}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "transformation"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
