import micropip
# Mock music21's deps that aren't available in Pyodide.
for pkg, ver in [('chardet', '5.2.0'), ('webcolors', '1.13')]:
    micropip.add_mock_package(pkg, ver)
await micropip.install('music21')
