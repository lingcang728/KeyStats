export { }

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            PORTABLE_EXECUTABLE_FILE?: string
            ELECTRON_RENDERER_URL?: string
        }
    }
}
