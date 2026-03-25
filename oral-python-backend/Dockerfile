FROM python:3.11-slim

WORKDIR /app

# ffmpeg is required for pydub to convert webm -> wav (used by /api/oral-eval)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY oral-python-backend/requirements.txt ./oral-python-backend/requirements.txt

RUN pip install --no-cache-dir -r oral-python-backend/requirements.txt

COPY oral-python-backend ./oral-python-backend

WORKDIR /app/oral-python-backend

EXPOSE 5001
ENV PORT=5001

CMD ["python", "app.py"]

