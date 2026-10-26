import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
// BASE_PATH is set by the GitHub Pages workflow (e.g. /repo-name/); local dev stays at '/'.
export default defineConfig({base:process.env.BASE_PATH||'/',plugins:[react(),tailwindcss()],resolve:{dedupe:['react','react-dom']},server:{host:'127.0.0.1',port:5194,strictPort:true}});
