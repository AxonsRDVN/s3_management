# Python S3 Multipart Upload UI

Project Flask nhỏ để upload file lên AWS S3 bằng multipart upload.

## Cài đặt

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
Copy-Item .env.example .env
```

Mở `.env` và thay:

```env
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

## Chạy app

```powershell
.\.venv\Scripts\python app.py
```

Sau đó mở:

```text
http://localhost:5000
```

## Ghi chú

- File được upload vào bucket `cpv-web-fileserver`.
- Key mặc định có prefix `pig_counter/`.
- Backend dùng S3 Multipart Upload API trực tiếp:
  - `create_multipart_upload`
  - `upload_part`
  - `complete_multipart_upload`
  - `abort_multipart_upload` nếu upload lỗi

# AWS-S3-CP
