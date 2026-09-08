class MockPrinterAdapter {
  async print(files, printerName) {
    console.log(`[MockPrinter] (simulasi) Akan print ${files.length} file ke "${printerName}":`, files);
    await new Promise((r) => setTimeout(r, 500));
  }
}

module.exports = MockPrinterAdapter;