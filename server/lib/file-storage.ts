import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { objectStorageClient } from "../replit_integrations/object_storage";
import { Readable } from "stream";

export type StorageBackend = "replit" | "s3";

export interface FileStorageConfig {
  backend: StorageBackend;
  s3?: {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    forcePathStyle?: boolean;
  };
}

function getStorageConfig(): FileStorageConfig {
  const s3Endpoint = process.env.S3_ENDPOINT;
  const s3AccessKey = process.env.S3_ACCESS_KEY;
  const s3SecretKey = process.env.S3_SECRET_KEY;
  const s3Bucket = process.env.S3_BUCKET_NAME;

  if (s3Endpoint && s3AccessKey && s3SecretKey && s3Bucket) {
    return {
      backend: "s3",
      s3: {
        endpoint: s3Endpoint,
        region: process.env.S3_REGION || "auto",
        accessKeyId: s3AccessKey,
        secretAccessKey: s3SecretKey,
        bucket: s3Bucket,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
      },
    };
  }

  return { backend: "replit" };
}

let s3ClientInstance: S3Client | null = null;

function getS3Client(config: FileStorageConfig): S3Client {
  if (!s3ClientInstance && config.s3) {
    s3ClientInstance = new S3Client({
      endpoint: config.s3.endpoint,
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
      forcePathStyle: config.s3.forcePathStyle ?? true,
    });
  }
  return s3ClientInstance!;
}

function parseReplitPath(storagePath: string): { bucketName: string; objectName: string } {
  let path = storagePath;
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error("Invalid path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export class FileStorageService {
  private config: FileStorageConfig;

  constructor() {
    this.config = getStorageConfig();
    if (this.config.backend === "s3") {
      console.log(`[storage] Using S3-compatible storage: ${this.config.s3!.endpoint}`);
    } else {
      console.log("[storage] Using Replit Object Storage");
    }
  }

  getBackend(): StorageBackend {
    return this.config.backend;
  }

  async saveFile(storagePath: string, content: Buffer, contentType?: string): Promise<void> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      await s3.send(new PutObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: key,
        Body: content,
        ContentType: contentType || "application/octet-stream",
      }));
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(content, { contentType: contentType || "application/octet-stream" });
    }
  }

  async readFile(storagePath: string): Promise<Buffer> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      const response = await s3.send(new GetObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: key,
      }));
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [content] = await file.download();
      return content;
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      await s3.send(new DeleteObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: key,
      }));
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.delete();
    }
  }

  async fileExists(storagePath: string): Promise<boolean> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      try {
        await s3.send(new HeadObjectCommand({
          Bucket: this.config.s3!.bucket,
          Key: key,
        }));
        return true;
      } catch {
        return false;
      }
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [exists] = await file.exists();
      return exists;
    }
  }

  async getUploadUrl(storagePath: string, ttlSec: number = 900): Promise<string> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      const command = new PutObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: key,
      });
      return getSignedUrl(s3, command, { expiresIn: ttlSec });
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "write",
        expires: Date.now() + ttlSec * 1000,
      });
      return url;
    }
  }

  async getDownloadUrl(storagePath: string, ttlSec: number = 3600): Promise<string> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
      const command = new GetObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: key,
      });
      return getSignedUrl(s3, command, { expiresIn: ttlSec });
    } else {
      const { bucketName, objectName } = parseReplitPath(storagePath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      const [url] = await file.getSignedUrl({
        version: "v4",
        action: "read",
        expires: Date.now() + ttlSec * 1000,
      });
      return url;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      const key = prefix.startsWith("/") ? prefix.slice(1) : prefix;
      const response = await s3.send(new ListObjectsV2Command({
        Bucket: this.config.s3!.bucket,
        Prefix: key,
      }));
      return (response.Contents || []).map(obj => obj.Key || "");
    } else {
      const { bucketName, objectName } = parseReplitPath(prefix);
      const bucket = objectStorageClient.bucket(bucketName);
      const [files] = await bucket.getFiles({ prefix: objectName });
      return files.map(f => f.name);
    }
  }

  getStoragePath(basePath: string, filename: string): string {
    if (this.config.backend === "s3") {
      return `${basePath}/${filename}`.replace(/\/+/g, "/");
    } else {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
      return `/${bucketId}/.private/${basePath}/${filename}`.replace(/\/+/g, "/");
    }
  }
}

export const fileStorage = new FileStorageService();
