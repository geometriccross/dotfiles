#!/bin/bash

sudo apt update
sudo apt upgrade -y
sudo apt install -y ansible git

git clone https://github.com/geometriccross/dotfiles.git ~/.dotfiles
ansible-playbook -K ~/.dotfiles/playbook.yml --extra-vars "user=$(whoami)"

sudo apt remove ansible -y
sudo apt autoremove -y
