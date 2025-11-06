FROM ubuntu:24.04

# install guide https://github.com/openwall/john/blob/bleeding-jumbo/doc/INSTALL-UBUNTU
# --> git, build-essential, libssl-dev, zlib1g-dev
# Zipファイルのパスワード検証に使う
# --> unzip
# ファイル編集に使う(別エディターでもOK）
# --> vim
# rockyou2021の展開に使う
# --> p7zip-full, p7zip-rar
RUN apt-get update && apt-get install -y \
  git \
  build-essential \
  libssl-dev \
  zlib1g-dev \
  unzip \
  vim \
  p7zip-full \
  p7zip-rar

# johnのインストールガイド内、必須確認内容のみ
RUN << EOF
	cd ~
	git clone https://github.com/openwall/john -b bleeding-jumbo john
	cd ~/john/src
	./configure
	make -s clean
	make -sj4
EOF

RUN  ln -s /root/john/run/pdf2john.pl /pdf2john.pl
