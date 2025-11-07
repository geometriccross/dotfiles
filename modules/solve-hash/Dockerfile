FROM nvidia/cuda:13.0.2-cudnn-devel-ubuntu24.04

RUN apt-get update \
        && apt install -y \
            wget \
            unzip \
            hashcat
        && rm -rf /var/lib/apt/lists/*
