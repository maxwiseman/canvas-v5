import type {
	CanvasSubmission,
	CanvasSubmissionDraft,
	CanvasTransport,
} from "./types";

const fields = "_id body(rewriteUrls: false) submissionAttempt";
async function graphql<T>(
	transport: CanvasTransport,
	query: string,
	variables: unknown,
): Promise<T> {
	const result = await transport.request<{
		data?: T;
		errors?: { message: string }[];
	}>("/api/graphql", {
		method: "POST",
		body: { query, variables },
	});
	if (result.errors?.length || !result.data)
		throw new Error(
			result.errors?.map((error) => error.message).join("; ") ||
				"Canvas did not return draft data.",
		);
	return result.data;
}

export async function readSubmissionDraft(
	transport: CanvasTransport,
	courseId: number,
	assignmentId: number,
	isCurrent = () => true,
) {
	// The normalized submission ID is local; obtain the actual Canvas ID.
	const submission = await transport.request<CanvasSubmission>(
		`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self`,
	);
	if (!isCurrent()) throw new Error("The Canvas account changed.");
	if (!submission.id) throw new Error("Canvas did not return a submission ID.");
	const result = await graphql<{
		submission: {
			_id: string;
			attempt: number | null;
			submissionDraft: {
				body: string | null;
				submissionAttempt: number;
			} | null;
		} | null;
	}>(
		transport,
		`query CanvasV5TextDraft($id: ID!) { submission(id: $id) { _id attempt submissionDraft { ${fields} } } }`,
		{ id: String(submission.id) },
	);
	if (!result.submission)
		throw new Error("Your Canvas submission is unavailable.");
	return {
		submissionId: result.submission._id,
		attempt: (result.submission.attempt ?? 0) + 1,
		body: result.submission.submissionDraft?.body ?? "",
	};
}

export async function writeSubmissionDraft(
	transport: CanvasTransport,
	draft: CanvasSubmissionDraft,
) {
	const result = await graphql<{
		createSubmissionDraft: {
			submissionDraft: {
				body: string | null;
				submissionAttempt: number;
			} | null;
			errors?: { message: string }[];
		};
	}>(
		transport,
		`mutation CanvasV5SaveTextDraft($input: CreateSubmissionDraftInput!) { createSubmissionDraft(input: $input) { submissionDraft { ${fields} } errors { message } } }`,
		{
			input: {
				submissionId: draft.submissionId,
				attempt: draft.attempt,
				activeSubmissionType: "online_text_entry",
				body: draft.body,
			},
		},
	);
	const saved = result.createSubmissionDraft;
	if (!saved?.submissionDraft || saved.errors?.length)
		throw new Error(
			saved?.errors?.map((error) => error.message).join("; ") ||
				"Canvas did not save the draft.",
		);
	if (saved.submissionDraft.submissionAttempt !== draft.attempt)
		throw new Error(
			"The submission attempt changed. Reload the draft before saving.",
		);
	return saved.submissionDraft.body ?? "";
}

/** Owns debouncing beyond the lifetime of the editor/route. Records are scoped to Canvas origin + user. */
export class SubmissionDraftSync {
	private timers = new Map<string, ReturnType<typeof setTimeout>>();
	private jobs = new Map<string, Promise<void>>();
	private loads = new Map<string, Promise<void>>();
	private writes = new Map<string, Promise<void>>();
	constructor(
		private readonly options: {
			transport: CanvasTransport;
			account: () => string | undefined;
			get: (id: string) => CanvasSubmissionDraft | undefined;
			publish: (draft: CanvasSubmissionDraft) => void;
			persist: (draft: CanvasSubmissionDraft) => Promise<void>;
		},
	) {}

	private async put(draft: CanvasSubmissionDraft) {
		this.options.publish(draft);
		const write = (this.writes.get(draft.id) ?? Promise.resolve())
			.catch(() => {})
			.then(() => this.options.persist(draft));
		this.writes.set(draft.id, write);
		try {
			await write;
			if (this.options.get(draft.id) === draft)
				this.options.publish({ ...draft, localSaved: true });
		} catch {
			if (this.options.get(draft.id) === draft)
				this.options.publish({
					...draft,
					localSaved: false,
					error:
						"Unable to save on this device. Keep the editor open until Canvas confirms saving.",
				});
		}
	}

	load(
		id: string,
		account: string,
		courseId: number,
		assignmentId: number,
	): Promise<void> {
		const existing = this.loads.get(id);
		if (existing) return existing;
		const job = this.loadOnce(
			id,
			account,
			courseId,
			assignmentId,
			true,
		).finally(() => this.loads.delete(id));
		this.loads.set(id, job);
		return job;
	}
	private async loadOnce(
		id: string,
		account: string,
		courseId: number,
		assignmentId: number,
		resume = false,
	) {
		const old = this.options.get(id);
		try {
			if (this.options.account() !== account) return;
			const remote = await readSubmissionDraft(
				this.options.transport,
				courseId,
				assignmentId,
				() => this.options.account() === account,
			);
			if (this.options.account() !== account) return;
			const current = this.options.get(id) ?? old;
			if (current !== old && !current?.pending) return;
			const conflict =
				current?.status === "conflict" ||
				(current?.pending &&
					((current.attempt !== undefined &&
						current.attempt !== remote.attempt) ||
						(remote.body !== current.baseBody &&
							remote.body !== current.body &&
							!(current.baseBody === undefined && remote.body === ""))));
			await this.put({
				id,
				account,
				courseId,
				assignmentId,
				...remote,
				...current,
				submissionId: remote.submissionId,
				attempt: remote.attempt,
				body: current?.pending ? current.body : remote.body,
				baseBody: current?.pending ? current.baseBody : remote.body,
				pending: current?.pending ?? false,
				status: conflict ? "conflict" : current?.pending ? "pending" : "saved",
				remoteBody: conflict ? remote.body : undefined,
				error: conflict
					? "Canvas has a different draft or a newer submission attempt. Choose which draft to keep."
					: undefined,
			});
			if (resume && current?.pending && !conflict) this.schedule(id);
		} catch (error) {
			if (this.options.account() !== account) return;
			await this.put({
				id,
				account,
				courseId,
				assignmentId,
				body: "",
				pending: false,
				...this.options.get(id),
				status:
					this.options.get(id)?.status === "conflict" ? "conflict" : "error",
				error:
					error instanceof Error
						? error.message
						: "Unable to load the Canvas draft.",
			});
		}
	}

	async edit(id: string, body: string) {
		const draft = this.options.get(id);
		if (!draft || draft.account !== this.options.account()) return;
		await this.put({
			...draft,
			body,
			pending: true,
			localSaved: false,
			status: draft.status === "conflict" ? "conflict" : "pending",
		});
		this.schedule(id);
	}
	private schedule(id: string) {
		clearTimeout(this.timers.get(id));
		this.timers.set(
			id,
			setTimeout(() => {
				this.timers.delete(id);
				void this.flush(id);
			}, 1000),
		);
	}
	async resolve(id: string, useLocal: boolean) {
		const draft = this.options.get(id);
		if (
			!draft ||
			draft.account !== this.options.account() ||
			draft.status !== "conflict"
		)
			return;
		await this.put({
			...draft,
			body: useLocal ? draft.body : (draft.remoteBody ?? ""),
			baseBody: draft.remoteBody ?? "",
			pending: useLocal,
			status: useLocal ? "pending" : "saved",
			remoteBody: undefined,
			error: undefined,
		});
		if (useLocal) await this.flush(id);
	}
	flush(id: string): Promise<void> {
		clearTimeout(this.timers.get(id));
		this.timers.delete(id);
		const existing = this.jobs.get(id);
		if (existing) return existing;
		const job = this.save(id).finally(() => this.jobs.delete(id));
		this.jobs.set(id, job);
		return job;
	}
	private async save(id: string) {
		let draft = this.options.get(id);
		if (
			!draft?.pending ||
			draft.status === "conflict" ||
			draft.account !== this.options.account()
		)
			return;

		await this.loadOnce(id, draft.account, draft.courseId, draft.assignmentId);
		draft = this.options.get(id);
		if (
			!draft?.submissionId ||
			!draft.attempt ||
			draft.status === "error" ||
			draft.status === "conflict" ||
			draft.account !== this.options.account()
		)
			return;

		while (
			draft?.pending &&
			draft.account === this.options.account() &&
			draft.status !== "conflict"
		) {
			const sent = draft;
			this.options.publish({ ...sent, status: "saving" });
			try {
				const body = await writeSubmissionDraft(this.options.transport, sent);
				const current = this.options.get(id);
				if (
					!current ||
					current.attempt !== sent.attempt ||
					current.status === "conflict"
				)
					return;
				const newer = current.body !== sent.body;
				await this.put({
					...current,
					body: newer ? current.body : body,
					baseBody: body,
					pending: newer,
					status: newer ? "pending" : "saved",
					error: undefined,
				});
				if (!newer) return;
			} catch (error) {
				const current = this.options.get(id);
				if (current)
					await this.put({
						...current,
						status: "error",
						error:
							error instanceof Error
								? error.message
								: "Unable to save to Canvas.",
					});
				return;
			}
			draft = this.options.get(id);
		}
	}
	async submitted(id: string) {
		clearTimeout(this.timers.get(id));
		this.timers.delete(id);
		await this.jobs.get(id);
		const draft = this.options.get(id);
		if (draft)
			await this.put({
				...draft,
				body: "",
				baseBody: "",
				pending: false,
				attempt: (draft.attempt ?? 0) + 1,
				status: "saved",
				error: undefined,
				remoteBody: undefined,
			});
	}
}
