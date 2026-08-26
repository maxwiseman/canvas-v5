export class CanvasRequestError extends Error {
	readonly status: number;
	readonly path: string;

	constructor(status: number, path: string) {
		super(`Canvas request failed (${status}) for ${path}`);
		this.name = "CanvasRequestError";
		this.status = status;
		this.path = path;
	}
}
