"""Upload one image file to Amazon S3.

Usage:
    python upload_image_to_s3.py path\\to\\image.jpg [optional/s3/key.jpg]
"""

import argparse
import mimetypes
import os
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Upload an image file to Amazon S3.")
    parser.add_argument("image", type=Path, help="Path to the image on this computer")
    parser.add_argument(
        "key",
        nargs="?",
        help="S3 object key. Defaults to S3_PREFIX plus the image filename.",
    )
    args = parser.parse_args()

    if not args.image.is_file():
        parser.error(f"Image file not found: {args.image}")

    bucket = os.getenv("S3_BUCKET") or os.getenv("AWS_S3_BUCKET_NAME")
    region = os.getenv("AWS_REGION") or os.getenv("AWS_S3_REGION")
    prefix = os.getenv("S3_PREFIX", "").strip("/")
    if not bucket:
        parser.error("Set S3_BUCKET (or AWS_S3_BUCKET_NAME) in .env.")

    key = args.key or "/".join(part for part in (prefix, args.image.name) if part)
    content_type, _ = mimetypes.guess_type(args.image.name)
    if not (content_type or "").startswith("image/"):
        parser.error("The selected file does not appear to be an image.")

    s3 = boto3.client("s3", region_name=region)
    try:
        s3.upload_file(
            str(args.image),
            bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
    except (BotoCoreError, ClientError) as error:
        raise SystemExit(f"Upload failed: {error}") from error

    print(f"Uploaded: s3://{bucket}/{key}")


if __name__ == "__main__":
    main()
