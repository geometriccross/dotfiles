#!/bin/bash

script_dir="$(dirname "$0" | xargs realpath)"

docker build "$script_dir" -t unlock-pdf
echo "$1" |
    xargs basename |
    xargs -I {} docker run --rm \
        --gpus all \
        --mount type=bind,source="$1",target=/{} \
        --mount type=bind,source="$script_dir/__container_inside_script.sh",target=/script.sh \
        unlock-pdf \
        /script.sh "/{}"