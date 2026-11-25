declare module 'pdfmake/build/pdfmake' {
  interface PdfMakeDocument {
    download(fileName: string): Promise<void>;
  }

  const pdfMake: {
    addVirtualFileSystem(files: Record<string, string>): void;
    createPdf(definition: Record<string, unknown>): PdfMakeDocument;
  };

  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts' {
  const virtualFileSystem: Record<string, string>;
  export default virtualFileSystem;
}
