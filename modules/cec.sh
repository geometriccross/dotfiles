#!/bin/bash

selected="$(conda env list | awk 'NR > 3 { print $1 }' | fzf --height=30%)"
conda activate "${selected}"
