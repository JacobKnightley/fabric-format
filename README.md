# fabric-format

A zero-config formatter for **Microsoft Fabric notebooks**.

## Philosophy

**Opinionated by design.** This formatter has one style, enforced everywhere, with no configuration options—and no plans to add any.

Built this for teams who want consistent notebook formatting without endless debates over style guides. The decisions are made. Your code looks the same every time.

The focus is on clean, consistent output—not tailored experiences or nuanced edge cases.

## Browser Extension

Format Fabric notebooks directly in your browser with a single click.
   
   ![ExtensionDemo](https://github.com/user-attachments/assets/30acd57f-0cd3-4edb-a0ae-f7db06ba1de1)

1. Install the Edge extension [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/fabric-format/pagkopelpfjaedelgckkbmcepekgheaj)
    > Until Chrome is supported, download the [extension](https://github.com/jacobknightley/fabric-format/releases) and [unpack](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked) in chrome developer mode
3. Open a notebook in Microsoft Fabric
4. Click the ![Format button in Fabric notebook toolbar](assets/extension-format-button.png) button in the notebook toolbar




## CLI
Format Fabric notebook-content files synced from a workspace in a repository.


```bash
# install
npm install -g @jacobknightley/fabric-format

# format
fabfmt format notebook.py                                # Format a single file
fabfmt format ./src                                      # Format all files in directory
fabfmt format query.sql --print                          # Print formatted output
fabfmt format --type sparksql -i "select * from t"       # Format inline string
echo "select * from t" | fabfmt format --type sparksql   # Format from stdin

# check (exit 1 if changes needed)
fabfmt check notebook.py                                # Check a single file
fabfmt check ./src                                      # Check all files in directory
fabfmt check --type sparksql -i "select * from t"       # Check inline string
echo "select * from t" | fabfmt check --type sparksql   # Check from stdin
```


### Supported File Types

- `.py` — Python notebooks
- `.scala` — Scala notebooks
- `.r` — R notebooks
- `.sql` — SQL notebooks


## Documentation
Find all documentation at [fabric-format wiki](https://github.com/JacobKnightley/fabric-format/wiki)
