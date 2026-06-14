import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useSyncExternalStore,
} from "react";

import { CanvasIndexedDbStore, emptySnapshot } from "./store";
import type {
	CanvasAssignment,
	CanvasConnectionInput,
	CanvasRuntimeMode,
	CanvasRuntimeSnapshot,
	CanvasTransport,
	CourseOverlay,
	OverlayTransport,
	QueuedMutation,
	SwitchCanvasAccountOptions,
	SyncScope,
	SyncScopeState,
} from "./types";

export interface CanvasRuntimeOptions {
	mode: CanvasRuntimeMode;
	canvasTransport: CanvasTransport;
	overlayTransport: OverlayTransport;
	openAppLogin?: () => void | Promise<void>;
	checkExtensionInstalled?: () => Promise<boolean>;
	openCanvasAccount?: (account: CanvasRuntimeSnapshot["activeAccount"]) => void;
	store?: CanvasIndexedDbStore;
}

export class CanvasRuntime {
	private listeners = new Set<() => void>();
	private bootPromise?: Promise<void>;
	private snapshot: CanvasRuntimeSnapshot;
	private readonly store: CanvasIndexedDbStore;

	constructor(private readonly options: CanvasRuntimeOptions) {
		this.snapshot = emptySnapshot(options.mode);
		this.store =
			options.store ??
			new CanvasIndexedDbStore(`canvas-v5-sdk:${options.mode}`);
	}

	subscribe = (listener: () => void) => {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	getSnapshot = () => this.snapshot;

	async openAppLogin() {
		if (this.options.openAppLogin) {
			await this.options.openAppLogin();
			return;
		}
		if (typeof window !== "undefined") {
			window.location.assign("/login");
		}
	}

	async refreshAppAuth() {
		const appAuth = await this.options.overlayTransport.probeAuth();
		this.setSnapshot({ ...this.snapshot, appAuth });
		if (appAuth.status === "authenticated") {
			await Promise.allSettled([
				this.syncConnections(),
				this.syncCourseOverlays(),
			]);
		}
	}

	async switchCanvasAccount(
		connectionId: string,
		options: SwitchCanvasAccountOptions = {},
	) {
		try {
			const account = this.snapshot.accounts.find(
				(candidate) => candidate.connectionId === connectionId,
			);
			if (!account) {
				throw new Error("Canvas connection not found.");
			}

			if (account.authMode === "canvas-session") {
				if (this.options.mode === "web") {
					const isExtensionInstalled =
						await this.options.checkExtensionInstalled?.();
					if (!isExtensionInstalled) {
						throw new Error(
							"Canvas V5 extension is required for Canvas session accounts.",
						);
					}
				}
				this.options.openCanvasAccount?.(account);
				return;
			}

			await this.selectCanvasConnection(connectionId);
		} catch (error) {
			const normalizedError =
				error instanceof Error
					? error
					: new Error("Unable to switch Canvas account.");
			options.onError?.(normalizedError);
			if (!options.onError) {
				throw normalizedError;
			}
		}
	}

	async selectCanvasConnection(connectionId: string) {
		const activeAccount = this.snapshot.accounts.find(
			(account) => account.connectionId === connectionId,
		);
		if (!activeAccount) {
			throw new Error("Canvas connection not found.");
		}

		const accounts = this.snapshot.accounts.map((account) => ({
			...account,
			isActive: account.connectionId === connectionId,
		}));
		const selectedAccount = { ...activeAccount, isActive: true };
		this.options.canvasTransport.setActiveAccount?.(selectedAccount);
		this.setSnapshot({
			...this.snapshot,
			canvasAuth: {
				status: "authenticated",
				baseUrl: selectedAccount.canvasBaseUrl,
				user: {
					id: selectedAccount.canvasUserId ?? selectedAccount.connectionId,
					name: selectedAccount.label,
				},
			},
			accounts,
			activeAccount: selectedAccount,
		});
		await this.store.replaceAll("connections", accounts);
		await Promise.allSettled([this.syncCourses(), this.syncCourseOverlays()]);
	}

	async saveCanvasConnection(input: CanvasConnectionInput) {
		this.setScope("accounts", { status: "syncing", pendingJobs: 1 });
		try {
			const connection =
				await this.options.overlayTransport.createConnection(input);
			const accounts = [
				...this.snapshot.accounts.filter(
					(account) => account.id !== connection.id,
				),
				connection,
			];
			const activeAccount = connection.isActive
				? connection
				: this.snapshot.activeAccount;
			this.options.canvasTransport.setActiveAccount?.(activeAccount);
			this.setSnapshot({ ...this.snapshot, accounts, activeAccount });
			await this.store.replaceAll("connections", accounts);
			this.setScope("accounts", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
			return connection;
		} catch (error) {
			this.setScope("accounts", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to save Canvas connection.",
			});
			throw error;
		}
	}

	async boot() {
		this.bootPromise ??= this.bootOnce();
		return this.bootPromise;
	}

	private async bootOnce() {
		try {
			const hydrated = await this.store.hydrate(this.options.mode);
			this.setSnapshot({
				...hydrated,
				mode: this.options.mode,
				courses: this.mergeCourseOverlaysForSnapshot(
					hydrated,
					hydrated.courses,
					hydrated.courseOverlays,
				),
			});
			this.options.canvasTransport.setActiveAccount?.(hydrated.activeAccount);
		} catch {
			this.setSnapshot(emptySnapshot(this.options.mode));
		}

		const [canvasAuth, appAuth] = await Promise.all([
			this.options.canvasTransport.probeAuth(),
			this.options.overlayTransport.probeAuth(),
		]);

		const probedActiveAccount =
			canvasAuth.status === "authenticated"
				? this.createProbedActiveAccount(canvasAuth)
				: undefined;
		const activeAccount =
			this.options.mode === "web"
				? this.snapshot.activeAccount
				: probedActiveAccount;

		const accounts =
			activeAccount &&
			!this.snapshot.accounts.some((account) => account.id === activeAccount.id)
				? [...this.snapshot.accounts, activeAccount]
				: this.snapshot.accounts;
		this.setSnapshot({
			...this.snapshot,
			canvasAuth,
			appAuth,
			activeAccount,
			accounts,
		});
		this.options.canvasTransport.setActiveAccount?.(activeAccount);
		await this.store.replaceAll("connections", accounts);

		if (appAuth.status === "authenticated") {
			await this.syncConnections();
		}

		if (
			this.options.mode === "web" &&
			this.snapshot.activeAccount &&
			canvasAuth.status !== "authenticated"
		) {
			await Promise.allSettled([this.syncCourses(), this.syncCourseOverlays()]);
		}

		if (canvasAuth.status === "authenticated") {
			await this.registerActiveConnection(this.snapshot.activeAccount);
			await Promise.allSettled([this.syncCourses(), this.syncCourseOverlays()]);
		}
	}

	async syncConnections() {
		this.setScope("accounts", { status: "syncing", pendingJobs: 1 });
		try {
			const accounts = await this.options.overlayTransport.listConnections();
			const activeConnectionId =
				this.snapshot.activeAccount?.connectionId ??
				accounts.find((account) => account.isActive)?.connectionId;
			const accountsWithActive = accounts.map((account) => ({
				...account,
				isActive: account.connectionId === activeConnectionId,
			}));
			const activeAccount =
				accountsWithActive.find((account) => account.isActive) ??
				this.snapshot.activeAccount;
			this.options.canvasTransport.setActiveAccount?.(activeAccount);
			this.setSnapshot({
				...this.snapshot,
				accounts: accountsWithActive,
				activeAccount,
			});
			await this.store.replaceAll("connections", accountsWithActive);
			this.setScope("accounts", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("accounts", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to sync Canvas connections.",
			});
		}
	}

	async syncCourses() {
		this.setScope("courses", { status: "syncing", pendingJobs: 1 });
		try {
			const courses = await this.options.canvasTransport.paginatedRequest<
				Record<string, unknown>
			>("/api/v1/courses?enrollment_state=active&include[]=term&per_page=100");
			const normalized = courses.map((course) => ({
				id: Number(course.id),
				name: typeof course.name === "string" ? course.name : "Untitled course",
				course_code:
					typeof course.course_code === "string"
						? course.course_code
						: undefined,
				workflow_state:
					typeof course.workflow_state === "string"
						? course.workflow_state
						: undefined,
				start_at: typeof course.start_at === "string" ? course.start_at : null,
				end_at: typeof course.end_at === "string" ? course.end_at : null,
				enrollment_term_id:
					typeof course.enrollment_term_id === "number"
						? course.enrollment_term_id
						: undefined,
			}));
			this.setSnapshot({
				...this.snapshot,
				courses: this.mergeCourseOverlaysForSnapshot(this.snapshot, normalized),
			});
			await this.store.replaceAll("courses", normalized);
			this.setScope("courses", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("courses", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error ? error.message : "Unable to sync courses.",
			});
		}
	}

	async syncAssignments(courseId: number) {
		this.setScope("assignments", { status: "syncing", pendingJobs: 1 });
		try {
			const assignments =
				await this.options.canvasTransport.paginatedRequest<CanvasAssignment>(
					`/api/v1/courses/${courseId}/assignments?per_page=100`,
				);
			const nextAssignments = [
				...this.snapshot.assignments.filter(
					(assignment) => assignment.course_id !== courseId,
				),
				...assignments.map((assignment) => ({
					...assignment,
					course_id: courseId,
				})),
			];
			this.setSnapshot({ ...this.snapshot, assignments: nextAssignments });
			await this.store.replaceAll("assignments", nextAssignments);
			this.setScope("assignments", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("assignments", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to sync assignments.",
			});
		}
	}

	async syncAssignment(courseId: number, assignmentId: number) {
		this.setScope("assignments", { status: "syncing", pendingJobs: 1 });
		try {
			const assignment =
				await this.options.canvasTransport.request<CanvasAssignment>(
					`/api/v1/courses/${courseId}/assignments/${assignmentId}`,
				);
			const normalizedAssignment = {
				...assignment,
				id: assignmentId,
				course_id: courseId,
			};
			const nextAssignments = [
				...this.snapshot.assignments.filter(
					(candidate) =>
						!(
							candidate.course_id === courseId &&
							candidate.id === normalizedAssignment.id
						),
				),
				normalizedAssignment,
			];
			this.setSnapshot({ ...this.snapshot, assignments: nextAssignments });
			await this.store.put("assignments", normalizedAssignment);
			this.setScope("assignments", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("assignments", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to sync assignment.",
			});
		}
	}

	async syncCourseOverlays() {
		this.setScope("course-overlays", { status: "syncing", pendingJobs: 1 });
		try {
			const courseOverlays =
				await this.options.overlayTransport.listCourseOverlays();
			this.setSnapshot({
				...this.snapshot,
				courseOverlays,
				courses: this.mergeCourseOverlaysForSnapshot(
					this.snapshot,
					undefined,
					courseOverlays,
				),
			});
			await this.store.replaceAll("courseOverlays", courseOverlays);
			this.setScope("course-overlays", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("course-overlays", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to sync course overlays.",
			});
		}
	}

	async updateCourseIcon(canvasCourseId: number, icon: string | null) {
		const activeAccount = this.snapshot.activeAccount;
		if (!activeAccount) {
			throw new Error("No active Canvas account.");
		}

		const now = new Date().toISOString();
		const optimisticOverlay: CourseOverlay = {
			id: `${activeAccount.connectionId}:${canvasCourseId}`,
			canvasConnectionId: activeAccount.connectionId,
			canvasCourseId,
			icon,
			updatedAt: now,
		};
		const mutation: QueuedMutation = {
			id: crypto.randomUUID(),
			type: "course-overlay.update",
			status: "queued",
			target: {
				canvasConnectionId: activeAccount.connectionId,
				canvasCourseId,
			},
			payload: { icon },
			createdAt: now,
			updatedAt: now,
		};

		const previousOverlays = this.snapshot.courseOverlays;
		const nextOverlays = upsertOverlay(previousOverlays, optimisticOverlay);
		const nextQueue = [...this.snapshot.mutationQueue, mutation];
		this.setSnapshot({
			...this.snapshot,
			courseOverlays: nextOverlays,
			courses: this.mergeCourseOverlaysForSnapshot(
				this.snapshot,
				undefined,
				nextOverlays,
			),
			mutationQueue: nextQueue,
		});
		await Promise.all([
			this.store.replaceAll("courseOverlays", nextOverlays),
			this.store.replaceAll("mutationQueue", nextQueue),
		]);

		try {
			const savedOverlay =
				await this.options.overlayTransport.updateCourseOverlay({
					canvasConnectionId: activeAccount.connectionId,
					canvasCourseId,
					icon,
				});
			const savedOverlays = upsertOverlay(
				this.snapshot.courseOverlays,
				savedOverlay,
			);
			const savedQueue = this.snapshot.mutationQueue.map((item) =>
				item.id === mutation.id
					? {
							...item,
							status: "acked" as const,
							updatedAt: new Date().toISOString(),
						}
					: item,
			);
			this.setSnapshot({
				...this.snapshot,
				courseOverlays: savedOverlays,
				courses: this.mergeCourseOverlaysForSnapshot(
					this.snapshot,
					undefined,
					savedOverlays,
				),
				mutationQueue: savedQueue,
			});
			await Promise.all([
				this.store.replaceAll("courseOverlays", savedOverlays),
				this.store.replaceAll("mutationQueue", savedQueue),
			]);
		} catch (error) {
			const failedQueue = this.snapshot.mutationQueue.map((item) =>
				item.id === mutation.id
					? {
							...item,
							status: "error" as const,
							error:
								error instanceof Error
									? error.message
									: "Overlay update failed.",
							updatedAt: new Date().toISOString(),
						}
					: item,
			);
			this.setSnapshot({
				...this.snapshot,
				courseOverlays: previousOverlays,
				courses: this.mergeCourseOverlaysForSnapshot(
					this.snapshot,
					undefined,
					previousOverlays,
				),
				mutationQueue: failedQueue,
			});
			await Promise.all([
				this.store.replaceAll("courseOverlays", previousOverlays),
				this.store.replaceAll("mutationQueue", failedQueue),
			]);
			throw error;
		}
	}

	private mergeCourseOverlaysForSnapshot(
		snapshot: CanvasRuntimeSnapshot,
		courses = snapshot.courses,
		overlays = snapshot.courseOverlays,
	) {
		return courses.map((course) => {
			const overlay = selectCourseOverlay(snapshot, course.id, overlays);
			return { ...course, app: { ...course.app, icon: overlay?.icon ?? null } };
		});
	}

	private createProbedActiveAccount(
		canvasAuth: Extract<
			CanvasRuntimeSnapshot["canvasAuth"],
			{ status: "authenticated" }
		>,
	) {
		const connectionId = `${canvasAuth.baseUrl}:${canvasAuth.user.id}:canvas-session`;
		const existingAccount = this.snapshot.accounts.find(
			(account) => account.connectionId === connectionId,
		);
		return {
			id: connectionId,
			label:
				existingAccount?.label ?? canvasAuth.user.name ?? canvasAuth.baseUrl,
			connectionId,
			canvasBaseUrl: canvasAuth.baseUrl,
			authMode: "canvas-session" as const,
			canvasUserId: String(canvasAuth.user.id),
			isActive: true,
		};
	}

	private async registerActiveConnection(
		activeAccount?: CanvasRuntimeSnapshot["activeAccount"],
	) {
		if (!activeAccount || this.snapshot.appAuth.status !== "authenticated") {
			return;
		}
		try {
			const savedConnection =
				await this.options.overlayTransport.ensureConnection(activeAccount);
			const accounts = [
				...this.snapshot.accounts.filter(
					(account) => account.id !== savedConnection.id,
				),
				savedConnection,
			];
			this.setSnapshot({
				...this.snapshot,
				accounts,
				activeAccount: savedConnection,
			});
			await this.store.replaceAll("connections", accounts);
		} catch {
			this.setScope("accounts", {
				status: "error",
				pendingJobs: 0,
				error: "Unable to register Canvas connection.",
			});
		}
	}

	private setScope(scope: SyncScope, patch: Partial<SyncScopeState>) {
		const syncScopes = this.snapshot.syncScopes.map((item) =>
			item.scope === scope ? { ...item, ...patch } : item,
		);
		this.setSnapshot({ ...this.snapshot, syncScopes });
		void this.store.replaceAll("syncScopes", syncScopes);
	}

	private setSnapshot(snapshot: CanvasRuntimeSnapshot) {
		this.snapshot = snapshot;
		for (const listener of this.listeners) {
			listener();
		}
	}
}

const CanvasRuntimeContext = createContext<CanvasRuntime | null>(null);

export function CanvasRuntimeProvider({
	runtime,
	children,
}: {
	runtime: CanvasRuntime;
	children: ReactNode;
}) {
	useEffect(() => {
		void runtime.boot();
	}, [runtime]);

	return (
		<CanvasRuntimeContext.Provider value={runtime}>
			{children}
		</CanvasRuntimeContext.Provider>
	);
}

export function useCanvasRuntime() {
	const runtime = useContext(CanvasRuntimeContext);
	if (!runtime) {
		throw new Error(
			"useCanvasRuntime must be used within CanvasRuntimeProvider.",
		);
	}
	return runtime;
}

export function useCanvasSnapshot() {
	const runtime = useCanvasRuntime();
	return useSyncExternalStore(
		runtime.subscribe,
		runtime.getSnapshot,
		runtime.getSnapshot,
	);
}

export function useCanvasAccounts() {
	return useCanvasSnapshot().accounts;
}

export function useCanvasConnections() {
	return useCanvasAccounts();
}

export function useActiveAccount() {
	return useCanvasSnapshot().activeAccount;
}

export function useCanvasAccountSwitcher() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	return useMemo(
		() => ({
			accounts: snapshot.accounts,
			activeAccount: snapshot.activeAccount,
			switchAccount: (
				connectionId: string,
				options?: SwitchCanvasAccountOptions,
			) => runtime.switchCanvasAccount(connectionId, options),
		}),
		[runtime, snapshot.accounts, snapshot.activeAccount],
	);
}

export function useSyncStatus() {
	return useCanvasSnapshot().syncScopes;
}

export function useCourses() {
	return useCanvasSnapshot().courses;
}

export function useCourse(courseId: number | string) {
	const normalizedCourseId = Number(courseId);
	return useCourses().find((course) => course.id === normalizedCourseId);
}

export function useAssignments(courseId?: number | string) {
	const runtime = useCanvasRuntime();
	const assignments = useCanvasSnapshot().assignments;
	const normalizedCourseId =
		courseId === undefined ? undefined : Number(courseId);

	useEffect(() => {
		if (normalizedCourseId !== undefined) {
			void runtime.syncAssignments(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);

	return normalizedCourseId === undefined
		? assignments
		: assignments.filter(
				(assignment) => assignment.course_id === normalizedCourseId,
			);
}

export function useAssignment(
	courseId: number | string,
	assignmentId: number | string,
) {
	const runtime = useCanvasRuntime();
	const assignments = useCanvasSnapshot().assignments;
	const normalizedCourseId = Number(courseId);
	const normalizedAssignmentId = Number(assignmentId);

	useEffect(() => {
		if (
			Number.isFinite(normalizedCourseId) &&
			Number.isFinite(normalizedAssignmentId)
		) {
			void runtime.syncAssignment(normalizedCourseId, normalizedAssignmentId);
		}
	}, [normalizedCourseId, normalizedAssignmentId, runtime]);

	return assignments.find(
		(assignment) =>
			assignment.course_id === normalizedCourseId &&
			assignment.id === normalizedAssignmentId,
	);
}

export function useModules(courseId?: number | string) {
	const modules = useCanvasSnapshot().modules;
	const normalizedCourseId =
		courseId === undefined ? undefined : Number(courseId);
	return normalizedCourseId === undefined
		? modules
		: modules.filter((module) => module.course_id === normalizedCourseId);
}

export function useAnnouncements(courseId?: number | string) {
	const announcements = useCanvasSnapshot().announcements;
	const normalizedCourseId =
		courseId === undefined ? undefined : Number(courseId);
	return normalizedCourseId === undefined
		? announcements
		: announcements.filter(
				(announcement) => announcement.course_id === normalizedCourseId,
			);
}

export function useMutationQueue() {
	return useCanvasSnapshot().mutationQueue;
}

export function useCourseOverlay(courseId: number | string) {
	const normalizedCourseId = Number(courseId);
	const snapshot = useCanvasSnapshot();
	return selectCourseOverlay(snapshot, normalizedCourseId);
}

export function useUpdateCourseIcon() {
	const runtime = useCanvasRuntime();
	return useCallback(
		(courseId: number, icon: string | null) =>
			runtime.updateCourseIcon(courseId, icon),
		[runtime],
	);
}

export function useCanvasCollection<T>(
	selector: (snapshot: CanvasRuntimeSnapshot) => T,
) {
	const snapshot = useCanvasSnapshot();
	return useMemo(() => selector(snapshot), [selector, snapshot]);
}

function upsertOverlay(overlays: CourseOverlay[], overlay: CourseOverlay) {
	return [...overlays.filter((item) => item.id !== overlay.id), overlay];
}

function selectCourseOverlay(
	snapshot: CanvasRuntimeSnapshot,
	courseId: number,
	overlays = snapshot.courseOverlays,
) {
	const activeConnectionId = snapshot.activeAccount?.connectionId;
	const courseOverlays = overlays.filter(
		(overlay) => overlay.canvasCourseId === courseId,
	);
	return (
		courseOverlays.find(
			(overlay) => overlay.canvasConnectionId === activeConnectionId,
		) ?? (courseOverlays.length === 1 ? courseOverlays[0] : undefined)
	);
}
