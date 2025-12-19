#!/bin/bash
cd /home/runner/work/ms-spark-formatter/ms-spark-formatter
cargo run --bin sparkfmt <<EOF
select a, b -- cols
from t
EOF
