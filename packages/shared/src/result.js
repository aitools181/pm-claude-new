export class AppError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "AppError";
    }
}
export const ok = (value) => ({ ok: true, value });
export const err = (error) => ({ ok: false, error });
//# sourceMappingURL=result.js.map