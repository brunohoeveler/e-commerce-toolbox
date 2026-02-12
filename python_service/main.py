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
    
    elif step_type in ['remove_text', 'remove_string']:
        column = config.get('column', '')
        text_to_remove = config.get('textToRemove', config.get('searchString', ''))
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
        file1_column = config.get('file1Column', config.get('sourceColumn', ''))
        file2_column = config.get('file2Column', config.get('targetColumn', ''))
        file1_slot = config.get('file1Slot', config.get('sourceFile', ''))
        file2_slot = config.get('file2Slot', config.get('targetFile', ''))
        
        if file1_column and file2_column:
            target_df = None
            
            if file2_slot and file2_slot in all_dataframes:
                target_df = all_dataframes[file2_slot]
            else:
                slot_ids = list(all_dataframes.keys())
                primary_slot = slot_ids[0] if slot_ids else None
                
                for slot_id in slot_ids:
                    if slot_id != primary_slot:
                        other_df = all_dataframes[slot_id]
                        if file2_column in other_df.columns:
                            target_df = other_df
                            break
                
                if target_df is None and len(slot_ids) > 1:
                    target_df = all_dataframes[slot_ids[1]]
            
            if target_df is not None and file1_column in df.columns:
                if file2_column in target_df.columns:
                    df = df.join(target_df, left_on=file1_column, right_on=file2_column, how='left')
                else:
                    print(f"Warning: Column '{file2_column}' not found in target file. Available columns: {target_df.columns}")
    
    elif step_type == 'replace_text':
        column = config.get('column', '')
        search_text = config.get('searchText', '')
        replace_text = config.get('replaceText', '')
        if column and search_text and column in df.columns:
            df = df.with_columns(
                pl.col(column).cast(pl.Utf8).str.replace_all(search_text, replace_text).alias(column)
            )
    
    elif step_type == 'extract_substring':
        column = config.get('column', '')
        start_pos = int(config.get('startPos', 0) or 0)
        length = int(config.get('length', 0) or 0)
        if column and column in df.columns:
            if length > 0:
                df = df.with_columns(
                    pl.col(column).cast(pl.Utf8).str.slice(start_pos, length).alias(column)
                )
            else:
                df = df.with_columns(
                    pl.col(column).cast(pl.Utf8).str.slice(start_pos).alias(column)
                )
    
    elif step_type == 'select_columns':
        columns = config.get('columns', [])
        if columns:
            existing_cols = [c for c in columns if c in df.columns]
            if existing_cols:
                df = df.select(existing_cols)
    
    elif step_type == 'remove_duplicates':
        column = config.get('column', '')
        if column and column in df.columns:
            df = df.unique(subset=[column], maintain_order=True)
    
    elif step_type == 'sort_rows':
        column = config.get('column', '')
        direction = config.get('direction', 'asc')
        if column and column in df.columns:
            descending = direction == 'desc'
            df = df.sort(column, descending=descending)
    
    elif step_type == 'concat_files':
        file2_slot = config.get('file2Slot', '')
        if file2_slot and file2_slot in all_dataframes:
            file2_df = all_dataframes[file2_slot]
            common_cols = [c for c in df.columns if c in file2_df.columns]
            if common_cols:
                df2_aligned = file2_df.select(common_cols)
                df = pl.concat([df.select(common_cols), df2_aligned])
    
    elif step_type == 'calculate':
        column1 = config.get('column1', '')
        operator = config.get('operator', 'add')
        column2 = config.get('column2', '')
        value = config.get('value', '')
        result_column = config.get('resultColumn', '')
        
        if column1 and result_column and column1 in df.columns:
            col1_expr = pl.col(column1).cast(pl.Utf8).str.replace_all(',', '.').cast(pl.Float64, strict=False).fill_null(0)
            
            if operator == 'abs':
                result_expr = col1_expr.abs()
            elif column2 and column2 in df.columns:
                col2_expr = pl.col(column2).cast(pl.Utf8).str.replace_all(',', '.').cast(pl.Float64, strict=False).fill_null(0)
                if operator == 'add':
                    result_expr = col1_expr + col2_expr
                elif operator == 'subtract':
                    result_expr = col1_expr - col2_expr
                elif operator == 'multiply':
                    result_expr = col1_expr * col2_expr
                elif operator == 'divide':
                    result_expr = pl.when(col2_expr != 0).then(col1_expr / col2_expr).otherwise(0)
                else:
                    result_expr = col1_expr
            elif value:
                try:
                    num_value = float(value.replace(',', '.'))
                    if operator == 'add':
                        result_expr = col1_expr + num_value
                    elif operator == 'subtract':
                        result_expr = col1_expr - num_value
                    elif operator == 'multiply':
                        result_expr = col1_expr * num_value
                    elif operator == 'divide':
                        result_expr = col1_expr / num_value if num_value != 0 else pl.lit(0)
                    else:
                        result_expr = col1_expr
                except:
                    result_expr = col1_expr
            else:
                result_expr = col1_expr
            
            df = df.with_columns(result_expr.round(2).cast(pl.Utf8).str.replace_all(r'\.', ',').alias(result_column))
    
    elif step_type == 'debit_credit':
        amount_column = config.get('amountColumn', '')
        target_column = config.get('targetColumn', 'SH')
        debit_value = config.get('debitValue', 'S')
        credit_value = config.get('creditValue', 'H')
        
        if amount_column and target_column and amount_column in df.columns:
            amount_expr = pl.col(amount_column).cast(pl.Utf8).str.replace_all(',', '.').cast(pl.Float64, strict=False).fill_null(0)
            result_expr = pl.when(amount_expr >= 0).then(pl.lit(debit_value)).otherwise(pl.lit(credit_value))
            df = df.with_columns(result_expr.alias(target_column))
    
    elif step_type == 'format_number':
        column = config.get('column', '')
        decimal_separator = config.get('decimalSeparator', ',')
        decimals = int(config.get('decimals', 2) or 2)
        remove_sign = config.get('removeSign', False)
        
        if column and column in df.columns:
            num_expr = pl.col(column).cast(pl.Utf8).str.replace_all(',', '.').cast(pl.Float64, strict=False).fill_null(0)
            if remove_sign:
                num_expr = num_expr.abs()
            result_expr = num_expr.round(decimals).cast(pl.Utf8)
            if decimal_separator == ',':
                result_expr = result_expr.str.replace_all(r'\.', ',')
            df = df.with_columns(result_expr.alias(column))
    
    elif step_type == 'format_date':
        column = config.get('column', '')
        output_format = config.get('outputFormat', 'DDMM')
        
        if column and column in df.columns:
            cleaned = pl.col(column).cast(pl.Utf8).str.replace_all(r'\.', '').str.replace_all(r'\-', '').str.replace_all(r'\/', '')
            if output_format == 'DDMM':
                result_expr = cleaned.str.slice(0, 4)
            elif output_format == 'DDMMYYYY':
                result_expr = cleaned.str.slice(0, 8)
            else:
                result_expr = cleaned
            df = df.with_columns(result_expr.alias(column))
    
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

@app.post("/execute-code")
async def execute_python_code(
    files: List[UploadFile] = File(...),
    slot_mapping: str = Form(...),
    python_code: str = Form(...),
    output_files: str = Form(...),
    template_files: Optional[str] = Form(None),
    mandant_info: Optional[str] = Form(None),
    time_period_info: Optional[str] = Form(None)
):
    """
    Execute user-defined Python code with uploaded files as input.
    
    - files: List of uploaded files
    - slot_mapping: JSON string mapping file indices to variable names (e.g., {"0": "data1", "1": "data2"})
    - python_code: The Python code to execute
    - output_files: JSON array of output file definitions
    - template_files: Optional JSON array of template files [{name, content_base64}]
    - mandant_info: Optional JSON object with mandant information (mandantennummer, beraternummer, etc.)
    - time_period_info: Optional JSON object with time period information (month, quarter, year)
    """
    try:
        mapping = json.loads(slot_mapping)
        outputs = json.loads(output_files)
        
        # Create a temporary working directory
        work_dir = tempfile.mkdtemp()
        vorlagen_dir = os.path.join(work_dir, "vorlagen")
        os.makedirs(vorlagen_dir, exist_ok=True)
        
        # Save template files to vorlagen/ directory
        if template_files:
            try:
                import base64
                templates = json.loads(template_files)
                for tpl in templates:
                    tpl_name = tpl.get('name', 'unknown')
                    tpl_content_b64 = tpl.get('content_base64', '')
                    if tpl_content_b64:
                        tpl_content = base64.b64decode(tpl_content_b64)
                        tpl_path = os.path.join(vorlagen_dir, tpl_name)
                        with open(tpl_path, 'wb') as f:
                            f.write(tpl_content)
            except Exception as e:
                print(f"Warning: Failed to load template files: {e}")
        
        # Create a namespace for code execution
        namespace = {
            'pl': pl,
            'pd': pd,
            'io': io,
        }
        
        # Add mandant info as variables if provided
        if mandant_info:
            try:
                mandant_data = json.loads(mandant_info)
                namespace['mandantennummer'] = mandant_data.get('mandantennummer', 0)
                namespace['beraternummer'] = mandant_data.get('beraternummer', 0)
                namespace['sachkontenlaenge'] = mandant_data.get('sachkontenlaenge', 0)
                namespace['sachkontenrahmen'] = mandant_data.get('sachkontenrahmen', 0)
            except Exception as e:
                print(f"Warning: Failed to parse mandant info: {e}")
        
        # Add time period info as variables if provided
        if time_period_info:
            try:
                time_data = json.loads(time_period_info)
                namespace['year'] = time_data.get('year', 0)
                if 'month' in time_data:
                    namespace['month'] = time_data.get('month')
                if 'quarter' in time_data:
                    namespace['quarter'] = time_data.get('quarter')
            except Exception as e:
                print(f"Warning: Failed to parse time period info: {e}")
        
        # Change to work directory so relative paths work
        original_cwd = os.getcwd()
        os.chdir(work_dir)
        
        # Load files into the namespace as file paths
        # We save files to temp directory so user code can use pl.read_csv(data1, ...) etc.
        temp_files = []
        for i, file in enumerate(files):
            content = await file.read()
            variable_name = mapping.get(str(i), f"data{i+1}")
            
            # Save to a temp file so user can use pl.read_csv(data1, ...) with their own parameters
            temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=f"_{file.filename}", dir=work_dir)
            temp_file.write(content)
            temp_file.close()
            temp_files.append(temp_file.name)
            
            # Assign the file path to the variable name
            namespace[variable_name] = temp_file.name
        
        # Execute the user's Python code
        try:
            exec(python_code, namespace)
        except Exception as e:
            os.chdir(original_cwd)
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)
            return JSONResponse({
                "success": False,
                "error": f"Code execution error: {str(e)}",
                "outputs": []
            }, status_code=400)
        
        # Collect outputs based on output_files configuration
        result_outputs = []
        for output_config in outputs:
            var_name = output_config.get('dataFrameVariable', 'result')
            output_name = output_config.get('name', 'export')
            output_format = output_config.get('format', 'csv').lower()
            
            if var_name not in namespace:
                result_outputs.append({
                    "name": output_name,
                    "format": output_format,
                    "error": f"Variable '{var_name}' not found in code output",
                    "success": False
                })
                continue
            
            df_result = namespace[var_name]
            
            # Convert pandas to polars if needed
            if isinstance(df_result, pd.DataFrame):
                df_result = pl.from_pandas(df_result)
            
            if not isinstance(df_result, pl.DataFrame):
                result_outputs.append({
                    "name": output_name,
                    "format": output_format,
                    "error": f"Variable '{var_name}' is not a DataFrame",
                    "success": False
                })
                continue
            
            # Generate output in requested format
            output_buffer = io.BytesIO()
            delimiter = output_config.get('delimiter', ';')
            
            if output_format == 'csv':
                df_result.write_csv(output_buffer, separator=delimiter)
                content_type = 'text/csv'
            elif output_format == 'xlsx':
                # Convert to pandas for Excel export
                df_result.to_pandas().to_excel(output_buffer, index=False, engine='openpyxl')
                content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            elif output_format == 'json':
                json_str = df_result.write_json()
                output_buffer.write(json_str.encode('utf-8'))
                content_type = 'application/json'
            else:
                df_result.write_csv(output_buffer, separator=delimiter)
                content_type = 'text/csv'
            
            output_buffer.seek(0)
            import base64
            content_b64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
            
            result_outputs.append({
                "name": output_name,
                "format": output_format,
                "content": content_b64,
                "content_type": content_type,
                "row_count": len(df_result),
                "columns": df_result.columns,
                "success": True
            })
        
        # Restore original directory and cleanup
        os.chdir(original_cwd)
        import shutil
        shutil.rmtree(work_dir, ignore_errors=True)
        
        return JSONResponse({
            "success": True,
            "outputs": result_outputs
        })
        
    except json.JSONDecodeError as e:
        return JSONResponse({
            "success": False,
            "error": f"Invalid JSON: {str(e)}",
            "outputs": []
        }, status_code=400)
    except Exception as e:
        import traceback
        return JSONResponse({
            "success": False,
            "error": f"Execution error: {str(e)}\n{traceback.format_exc()}",
            "outputs": []
        }, status_code=500)

@app.post("/export-datev")
async def export_datev(
    output_csv: UploadFile = File(...),
    pattern_file: Optional[UploadFile] = File(None),
    mandant_info: str = Form(...),
    time_period_info: str = Form(...),
    process_name: str = Form("")
):
    try:
        import base64
        import calendar

        mandant_data = json.loads(mandant_info)
        time_data = json.loads(time_period_info)

        beraternummer = str(mandant_data.get('beraternummer', ''))
        mandantennummer = str(mandant_data.get('mandantennummer', ''))
        sachkontenlaenge = str(mandant_data.get('sachkontenlaenge', 4))
        sachkontenrahmen = str(mandant_data.get('sachkontenrahmen', 3))

        year = str(time_data.get('year', 2026))
        month = int(time_data.get('month', 1))
        month_number = str(month).zfill(2)
        days = str(calendar.monthrange(int(year), month)[1]).zfill(2)

        safe_description = (process_name or "").replace(";", " ").replace("\n", " ").replace("\r", "")

        datev_line = (
            "DTVF;700;21;Buchungsstapel;12;;;;;;"
            + beraternummer + ";" + mandantennummer + ";"
            + year + "0101;" + sachkontenlaenge + ";"
            + year + month_number + "01;" + year + month_number + days + ";"
            + safe_description + ";;1;0;0;EUR;;;;;" + sachkontenrahmen + "\n"
        )

        output_content = await output_csv.read()
        try:
            output_text = output_content.decode('utf-8')
        except UnicodeDecodeError:
            output_text = output_content.decode('latin-1')
            output_content = output_text.encode('utf-8')
        detected_sep = ','
        first_line = output_text.split('\n')[0] if output_text else ''
        if ';' in first_line and ',' not in first_line:
            detected_sep = ';'
        elif '\t' in first_line:
            detected_sep = '\t'
        data_df = pl.read_csv(io.BytesIO(output_content), separator=detected_sep, infer_schema_length=10000)

        if pattern_file:
            pattern_content = await pattern_file.read()
            try:
                pattern_text = pattern_content.decode('utf-8')
            except UnicodeDecodeError:
                pattern_text = pattern_content.decode('latin-1')
                pattern_content = pattern_text.encode('utf-8')
            pattern_first = pattern_text.split('\n')[0] if pattern_text else ''
            pattern_sep = ';'
            if '\t' in pattern_first and ';' not in pattern_first:
                pattern_sep = '\t'
            elif ',' in pattern_first and ';' not in pattern_first:
                pattern_sep = ','
            pattern_df = pl.read_csv(io.BytesIO(pattern_content), separator=pattern_sep, infer_schema_length=10000)
            data_df = data_df.cast({col: pl.Utf8 for col in data_df.columns})
            pattern_df = pattern_df.cast({col: pl.Utf8 for col in pattern_df.columns})
            aligned_df = pl.concat([pattern_df, data_df], how="align")
        else:
            aligned_df = data_df

        csv_buffer = io.BytesIO()
        aligned_df.write_csv(csv_buffer, separator=";")
        csv_buffer.seek(0)
        csv_content = csv_buffer.getvalue().decode("utf-8")

        final_content = datev_line + csv_content

        content_b64 = base64.b64encode(final_content.encode("utf-8")).decode("utf-8")

        return JSONResponse({
            "success": True,
            "content": content_b64,
            "content_type": "text/csv",
            "row_count": len(aligned_df),
            "columns": aligned_df.columns
        })

    except Exception as e:
        import traceback
        return JSONResponse({
            "success": False,
            "error": f"DATEV export error: {str(e)}\n{traceback.format_exc()}"
        }, status_code=500)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "transformation"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001)
