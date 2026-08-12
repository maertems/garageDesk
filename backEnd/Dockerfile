FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 80

ENV PYTHONUNBUFFERED=1

# MySQL connection: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "80"]
