/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROXY_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// pdfmake bundled fonts have no shipped types.
declare module 'pdfmake/build/pdfmake' {
  const pdfMake: any;
  export default pdfMake;
}
declare module 'pdfmake/build/vfs_fonts' {
  const pdfFonts: any;
  export default pdfFonts;
}
