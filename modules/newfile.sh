#!/bin/bash

dirname "$1" | xargs mkdir -p
touch "$1"
chmod +x "$1"

echo "#!/bin/bash" >> "$1"
