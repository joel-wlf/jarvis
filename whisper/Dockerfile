# whisper.cpp HTTP-Server (CPU) für Sprachnachrichten. Baut auf dem Pi selbst (arm64), dauert einige Minuten.
FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential cmake git curl ca-certificates && rm -rf /var/lib/apt/lists/*
ARG WHISPER_REF=v1.8.7
RUN git clone --depth 1 --branch ${WHISPER_REF} https://github.com/ggml-org/whisper.cpp /src
WORKDIR /src
RUN cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
 && cmake --build build -j2 --config Release --target whisper-server
# Modellgröße: base (~150 MB, schnell, ungenauer) | small (~470 MB, Standard) | medium (~1,5 GB, genau, sehr langsam)
ARG MODEL=small
RUN curl -fL -o /model.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 && rm -rf /var/lib/apt/lists/*
COPY --from=build /src/build/bin/whisper-server /usr/local/bin/whisper-server
COPY --from=build /model.bin /models/model.bin
EXPOSE 8080
# --convert: ffmpeg wandelt WhatsApps ogg/opus in WAV um. Sprache pro Request überschreibbar.
CMD ["whisper-server", "-m", "/models/model.bin", "--host", "0.0.0.0", "--port", "8080", "--convert", "-l", "de", "-t", "3"]
