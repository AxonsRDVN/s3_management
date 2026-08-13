#!/usr/bin/env python3
"""List objects under an S3 prefix.

Usage:
    python list_s3_prefix.py
    python list_s3_prefix.py --prefix Counting_Pigs/
    python list_s3_prefix.py --bucket my-bucket --prefix some/path/
"""

import argparse
import os
from datetime import timezone

import boto3
from dotenv import load_dotenv


def env(name, default=None):
    value = os.getenv(name)
    return default if value is None or value == "" else value


def load_environment():
    if os.path.exists(".env"):
        load_dotenv(".env", override=False)


def clean_prefix(prefix):
    normalized = (prefix or "").replace("\\", "/").strip("/")
    return f"{normalized}/" if normalized else ""


def get_s3_client(region):
    return boto3.client(
        "s3",
        region_name=region,
        aws_access_key_id=env("AWS_ACCESS_KEY_ID"),
        aws_secret_access_key=env("AWS_SECRET_ACCESS_KEY"),
    )


def list_prefix(bucket, prefix, region):
    s3_client = get_s3_client(region)
    normalized_prefix = clean_prefix(prefix)

    paginator = s3_client.get_paginator("list_objects_v2")
    pages = paginator.paginate(
        Bucket=bucket,
        Prefix=normalized_prefix,
        Delimiter="/",
    )

    objects = []
    folders = []

    for page in pages:
        for item in page.get("CommonPrefixes", []):
            folders.append(item["Prefix"])

        for item in page.get("Contents", []):
            key = item["Key"]
            if key == normalized_prefix:
                continue
            if key.endswith("/"):
                continue
            objects.append(item)

    print(f"Bucket: {bucket}")
    print(f"Prefix: {normalized_prefix or '(root)'}")
    print()

    if folders:
        print("Folders:")
        for folder in sorted(set(folders)):
            print(f"  - {folder}")
        print()

    if objects:
        print("Objects:")
        for item in sorted(objects, key=lambda x: x["Key"]):
            last_modified = item.get("LastModified")
            if last_modified is not None:
                last_modified = last_modified.astimezone(timezone.utc).isoformat()
            else:
                last_modified = "unknown"

            print(
                f"  - {item['Key']} | size={item.get('Size', 0)} bytes | "
                f"last_modified={last_modified}"
            )
    else:
        print("No objects found under this prefix.")


def main():
    load_environment()

    parser = argparse.ArgumentParser(description="List objects under an S3 prefix")
    parser.add_argument("--bucket", default=env("S3_BUCKET") or env("AWS_S3_BUCKET_NAME"), help="S3 bucket name")
    parser.add_argument("--prefix", default=env("S3_PREFIX", "Counting_Pigs/"), help="S3 prefix to inspect")
    parser.add_argument("--region", default=env("AWS_REGION") or env("AWS_S3_REGION"), help="AWS region")
    args = parser.parse_args()

    if not args.bucket:
        raise SystemExit("Missing bucket. Set S3_BUCKET or pass --bucket.")
    if not args.region:
        raise SystemExit("Missing region. Set AWS_REGION/AWS_S3_REGION or pass --region.")

    list_prefix(args.bucket, args.prefix, args.region)


if __name__ == "__main__":
    main()