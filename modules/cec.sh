#!/bin/bash

selected="$(micromamba env list | awk 'NR > 3 { print $1 }' | fzf --height=30%)"
micromamba activate "${selected}"
