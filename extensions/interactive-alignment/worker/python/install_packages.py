"""Install the pure-Python packages the pipeline needs, via micropip.

Runs after the shims are registered: synctoolbox is installed with deps=False
because its dependency list (numba, libfmp, librosa, ...) is either shimmed or
already provided by Pyodide.
"""

import micropip

await micropip.install('synctoolbox==1.4.2', deps=False)
await micropip.install('libtsm==1.1.2')
