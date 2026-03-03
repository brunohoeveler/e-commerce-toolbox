import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { objectStorageClient } from "../replit_integrations/object_storage";
import { Readable } from "stream";

export type StorageBackend = "replit" | "s3";

export interface FileStorageConfig {
  backend: StorageBackend;
  pathPrefix: string;
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
  const pathPrefix = (process.env.S3_PATH_PREFIX || "").replace(/^\/+|\/+$/g, "");

  if (s3Endpoint && s3AccessKey && s3SecretKey && s3Bucket) {
    return {
      backend: "s3",
      pathPrefix,
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

  return { backend: "replit", pathPrefix: "" };
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
  if (parts.length < 3) throw new Error(`Invalid Replit storage path: ${storagePath}`);
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

function getReplitBucketId(): string {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return bucketId;
}

function getReplitPrivateDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR not set");
  return dir.replace(/^\/[^\/]+\//, "").replace(/\/+$/, "");
}

export class FileStorageService {
  private config: FileStorageConfig;

  constructor() {
    this.config = getStorageConfig();
    if (this.config.backend === "s3") {
      const prefix = this.config.pathPrefix ? ` (prefix: ${this.config.pathPrefix})` : "";
      console.log(`[storage] Using S3-compatible storage: ${this.config.s3!.endpoint}${prefix}`);
    } else {
      console.log("[storage] Using Replit Object Storage");
    }
  }

  getBackend(): StorageBackend {
    return this.config.backend;
  }

  buildPath(category: string, ...segments: string[]): string {
    const parts = [category, ...segments].filter(Boolean);
    const relativePath = parts.join("/").replace(/\/+/g, "/");

    if (this.config.backend === "s3") {
      const prefix = this.config.pathPrefix;
      return prefix ? `${prefix}/${relativePath}` : relativePath;
    } else {
      const bucketId = getReplitBucketId();
      const privateDir = getReplitPrivateDir();
      return `/${bucketId}/${privateDir}/${relativePath}`;
    }
  }

  private toS3Key(storagePath: string): string {
    return storagePath.startsWith("/") ? storagePath.slice(1) : storagePath;
  }

  async saveFile(storagePath: string, content: Buffer, contentType?: string): Promise<void> {
    if (this.config.backend === "s3") {
      const s3 = getS3Client(this.config);
      await s3.send(new PutObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: this.toS3Key(storagePath),
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
      const response = await s3.send(new GetObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: this.toS3Key(storagePath),
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
      await s3.send(new DeleteObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: this.toS3Key(storagePath),
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
      try {
        await s3.send(new HeadObjectCommand({
          Bucket: this.config.s3!.bucket,
          Key: this.toS3Key(storagePath),
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
      const command = new PutObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: this.toS3Key(storagePath),
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
      const command = new GetObjectCommand({
        Bucket: this.config.s3!.bucket,
        Key: this.toS3Key(storagePath),
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
      const response = await s3.send(new ListObjectsV2Command({
        Bucket: this.config.s3!.bucket,
        Prefix: this.toS3Key(prefix),
      }));
      return (response.Contents || []).map(obj => obj.Key || "");
    } else {
      const { bucketName, objectName } = parseReplitPath(prefix);
      const bucket = objectStorageClient.bucket(bucketName);
      const [files] = await bucket.getFiles({ prefix: objectName });
      return files.map(f => f.name);
    }
  }
}

export const fileStorage = new FileStorageService();
