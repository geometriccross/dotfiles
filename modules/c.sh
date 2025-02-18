#!/bin/bash

# conda setup
if [ -z "${CONDA_DEFAULT_ENV}" ]; then
	conda activate
else
	conda deactivate
fi
