"""Download one image from Amazon S3.

Usage:
    python download_image_from_s3.py optional/s3/key.jpg [path\\to\\saved-image.jpg]
"""

import argparse
import os
from pathlib import Path

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from dotenv import load_dotenv


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Download an image from Amazon S3.")
    parser.add_argument("key", help="S3 object key, for example: images/photo.jpg")
    parser.add_argument(
        "output",
        nargs="?",
        type=Path,
        help="Local output path. Defaults to downloads/<filename from key>.",
    )
    args = parser.parse_args()

    bucket = os.getenv("S3_BUCKET") or os.getenv("AWS_S3_BUCKET_NAME")
    region = os.getenv("AWS_REGION") or os.getenv("AWS_S3_REGION")
    if not bucket:
        parser.error("Set S3_BUCKET (or AWS_S3_BUCKET_NAME) in .env.")

    filename = Path(args.key).name
    if not filename:
        parser.error("The S3 key must identify a file.")
    output = args.output or Path("downloads") / filename
    output.parent.mkdir(parents=True, exist_ok=True)

    s3 = boto3.client("s3", region_name=region)
    try:
        s3.download_file(bucket, args.key, str(output))
    except (BotoCoreError, ClientError) as error:
        raise SystemExit(f"Download failed: {error}") from error

    print(f"Downloaded: {output.resolve()}")


if __name__ == "__main__":
    main()
