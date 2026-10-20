FROM python:3.11-slim-bookworm

ARG DEBIAN_MIRROR=deb.debian.org
ARG PIP_INDEX_URL=https://pypi.org/simple

WORKDIR /app

RUN sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources \
    && apt-get -o Acquire::Retries=5 -o Acquire::http::Timeout=30 update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && ffprobe -version \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install \
    --no-cache-dir \
    --disable-pip-version-check \
    --retries 5 \
    --timeout 60 \
    --index-url "${PIP_INDEX_URL}" \
    -r requirements.txt

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 8000

CMD ["./entrypoint.sh"]
