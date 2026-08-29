import {
	type CanvasAccountRef,
	fetchNormalizedAssignments,
	fetchNormalizedCourseSearchContent,
	fetchNormalizedCourses,
	normalizeCanvasResource,
} from "@canvas-v5/canvas-core";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { stableSortByDate, stableSortByLabel } from "./stable-order";
import { CanvasIndexedDbStore, emptySnapshot } from "./store";
import type {
	AssignmentComment,
	CanvasActivityItem,
	CanvasAnnouncement,
	CanvasAssignment,
	CanvasCalendarItem,
	CanvasCommunicationChannel,
	CanvasConnectionInput,
	CanvasConversation,
	CanvasCourseDefaultView,
	CanvasCourseHome,
	CanvasCourseTab,
	CanvasCourseUser,
	CanvasDiscussionEntry,
	CanvasDiscussionTopic,
	CanvasEnrollment,
	CanvasExternalToolLaunch,
	CanvasFile,
	CanvasModule,
	CanvasModuleItem,
	CanvasModuleItemAssetType,
	CanvasModuleItemSequence,
	CanvasNotificationPreference,
	CanvasPage,
	CanvasPlannerItem,
	CanvasQuiz,
	CanvasRuntimeMode,
	CanvasRuntimeSnapshot,
	CanvasSubmission,
	CanvasSubmissionInput,
	CanvasTransport,
	CourseOverlay,
	OverlayTransport,
	QueuedMutation,
	SwitchCanvasAccountOptions,
	SyncScope,
	SyncScopeState,
} from "./types";

const SEARCH_INDEX_VERSION = 5;

function calendarContextCodes(snapshot: CanvasRuntimeSnapshot) {
	const userId =
		snapshot.canvasAuth.status === "authenticated"
			? snapshot.canvasAuth.user.id
			: snapshot.activeAccount?.canvasUserId;
	return [
		...(userId ? [`user_${userId}`] : []),
		...snapshot.courses
			.map((course) => course.id)
			.sort((left, right) => left - right)
			.map((courseId) => `course_${courseId}`),
	];
}

function calendarEventsPath(contextCodes: string[]) {
	const search = new URLSearchParams({
		type: "event",
		all_events: "true",
		per_page: "100",
	});
	for (const contextCode of contextCodes) {
		search.append("context_codes[]", contextCode);
	}
	return `/api/v1/calendar_events?${search.toString()}`;
}

function chunk<T>(values: T[], size: number) {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) {
		chunks.push(values.slice(index, index + size));
	}
	return chunks;
}

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
	private calendarSyncGeneration = 0;
	private moduleItemSequenceCache = new Map<string, CanvasModuleItemSequence>();
	private moduleItemSequenceRequests = new Map<
		string,
		Promise<CanvasModuleItemSequence>
	>();
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

	async signOutApp() {
		await this.options.overlayTransport.signOutApp();
		this.setSnapshot({
			...this.snapshot,
			appAuth: { status: "unauthenticated", reason: "Signed out." },
			accounts: [],
			activeAccount: undefined,
		});
		this.options.canvasTransport.setActiveAccount?.(undefined);
		await this.store.replaceAll("connections", []);
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
			void this.syncSearchContent();
		}

		if (canvasAuth.status === "authenticated") {
			await this.registerActiveConnection(this.snapshot.activeAccount);
			await Promise.allSettled([this.syncCourses(), this.syncCourseOverlays()]);
			void this.syncSearchContent();
		}
	}

	async syncSearchContent(force = false) {
		const searchScope = this.snapshot.syncScopes.find(
			(scope) => scope.scope === "search",
		);
		const lastSyncedAt = searchScope?.lastSyncedAt
			? new Date(searchScope.lastSyncedAt).getTime()
			: 0;
		if (
			!force &&
			searchScope?.indexVersion === SEARCH_INDEX_VERSION &&
			Date.now() - lastSyncedAt < 30 * 60 * 1000
		) {
			return;
		}

		this.setScope("search", {
			status: "syncing",
			pendingJobs: this.snapshot.courses.length,
		});
		try {
			const syncAccount = this.getSyncAccount();
			const generationId = crypto.randomUUID();
			const observedAt = new Date().toISOString();
			const assignments = [] as CanvasRuntimeSnapshot["assignments"];
			const resources = [] as CanvasRuntimeSnapshot["resources"];
			for (const course of this.snapshot.courses) {
				const { assignments: courseAssignments, resources: courseResources } =
					await fetchNormalizedCourseSearchContent(
						this.options.canvasTransport,
						syncAccount,
						course.id,
						observedAt,
						[course.syllabus_body],
					);
				assignments.push(
					...courseAssignments.map(
						(assignment) =>
							({
								...assignment,
							}) as CanvasRuntimeSnapshot["assignments"][number],
					),
				);
				resources.push(...courseResources);
				await Promise.all([
					this.store.applySnapshot({
						account: syncAccount,
						scope: "assignments",
						scopeKey: String(course.id),
						generationId,
						observedAt,
						records: courseAssignments,
					}),
					this.store.applySnapshot({
						account: syncAccount,
						scope: "resources",
						scopeKey: String(course.id),
						generationId,
						observedAt,
						records: courseResources,
					}),
				]);
			}
			this.setSnapshot({ ...this.snapshot, assignments, resources });
			this.finishScope("search", { indexVersion: SEARCH_INDEX_VERSION });
		} catch (error) {
			this.failScope(
				"search",
				error,
				"Unable to refresh the local search index.",
			);
		}
	}

	async syncConnections() {
		this.setScope("accounts", { status: "syncing", pendingJobs: 1 });
		try {
			const accounts = await this.options.overlayTransport.listConnections();
			const currentActiveAccount = this.snapshot.activeAccount;
			const activeConnectionId =
				currentActiveAccount?.connectionId ??
				accounts.find((account) => account.isActive)?.connectionId;
			const accountsWithActive = accounts.map((account) => {
				const probedAccount =
					currentActiveAccount?.connectionId === account.connectionId
						? currentActiveAccount
						: undefined;
				return {
					...account,
					...(probedAccount?.canvasUserName
						? { canvasUserName: probedAccount.canvasUserName }
						: {}),
					...(probedAccount?.canvasAvatarUrl
						? { canvasAvatarUrl: probedAccount.canvasAvatarUrl }
						: {}),
					isActive: account.connectionId === activeConnectionId,
				};
			});
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
			const syncAccount = this.getSyncAccount();
			const normalized = await fetchNormalizedCourses(
				this.options.canvasTransport,
				syncAccount,
			);
			this.setSnapshot({
				...this.snapshot,
				courses: this.mergeCourseOverlaysForSnapshot(this.snapshot, normalized),
			});
			await this.store.applySnapshot({
				account: syncAccount,
				scope: "courses",
				generationId: crypto.randomUUID(),
				observedAt: normalized[0]?.observedAt ?? new Date().toISOString(),
				records: normalized,
			});
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

	async syncCourseHome(courseId: number, defaultView: CanvasCourseDefaultView) {
		if (defaultView !== "wiki" && defaultView !== "feed") return;

		this.setScope("course-home", { status: "syncing", pendingJobs: 1 });
		try {
			const current = this.snapshot.courseHomes.find(
				(home) => home.course_id === courseId,
			) ?? { id: courseId, course_id: courseId };
			let courseHome: CanvasCourseHome;

			if (defaultView === "wiki") {
				const frontPage =
					await this.options.canvasTransport.request<CanvasPage>(
						`/api/v1/courses/${courseId}/front_page`,
					);
				courseHome = { ...current, front_page: frontPage };
			} else {
				const activityStream =
					await this.options.canvasTransport.paginatedRequest<CanvasActivityItem>(
						`/api/v1/courses/${courseId}/activity_stream?per_page=100`,
					);
				courseHome = { ...current, activity_stream: activityStream };
			}

			const courseHomes = [
				...this.snapshot.courseHomes.filter(
					(home) => home.course_id !== courseId,
				),
				courseHome,
			];
			this.setSnapshot({ ...this.snapshot, courseHomes });
			await this.store.put("courseHomes", courseHome);
			this.setScope("course-home", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("course-home", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error
						? error.message
						: "Unable to sync the course home page.",
			});
		}
	}

	async syncAssignments(courseId: number) {
		this.setScope("assignments", { status: "syncing", pendingJobs: 1 });
		try {
			const syncAccount = this.getSyncAccount();
			const assignments = await fetchNormalizedAssignments(
				this.options.canvasTransport,
				syncAccount,
				courseId,
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
			await this.store.applySnapshot({
				account: syncAccount,
				scope: "assignments",
				scopeKey: String(courseId),
				generationId: crypto.randomUUID(),
				observedAt: assignments[0]?.observedAt ?? new Date().toISOString(),
				records: assignments,
			});
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

	async syncPeople(courseId: number) {
		this.setScope("people", { status: "syncing", pendingJobs: 1 });
		try {
			const users = await this.options.canvasTransport.paginatedRequest<
				Record<string, unknown>
			>(`/api/v1/courses/${courseId}/users?per_page=100`);
			const people: CanvasCourseUser[] = users
				.filter((user) => user.id !== undefined && user.id !== null)
				.map((user) => ({
					id: `${courseId}:${String(user.id)}`,
					canvas_user_id:
						typeof user.id === "number" || typeof user.id === "string"
							? user.id
							: String(user.id),
					course_id: courseId,
					name: typeof user.name === "string" ? user.name : "Canvas user",
					short_name:
						typeof user.short_name === "string" ? user.short_name : undefined,
					sortable_name:
						typeof user.sortable_name === "string"
							? user.sortable_name
							: undefined,
					avatar_url:
						typeof user.avatar_url === "string" ? user.avatar_url : undefined,
				}));
			const nextPeople = [
				...this.snapshot.people.filter(
					(person) => person.course_id !== courseId,
				),
				...people,
			];
			this.setSnapshot({ ...this.snapshot, people: nextPeople });
			await this.store.replaceAll("people", nextPeople);
			this.setScope("people", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("people", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error ? error.message : "Unable to sync people.",
			});
		}
	}

	async syncEnrollments(courseId: number) {
		this.setScope("enrollments", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasEnrollment>(
					`/api/v1/courses/${courseId}/enrollments?state[]=active&per_page=100`,
				);
			const enrollments = [
				...this.snapshot.enrollments.filter(
					(enrollment) => enrollment.course_id !== courseId,
				),
				...records.map((record) => ({ ...record, course_id: courseId })),
			];
			this.setSnapshot({ ...this.snapshot, enrollments });
			await this.store.replaceAll("enrollments", enrollments);
			this.finishScope("enrollments");
		} catch (error) {
			this.failScope("enrollments", error, "Unable to sync enrollments.");
		}
	}

	async syncAnnouncements(courseId: number) {
		this.setScope("announcements", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasAnnouncement>(
					`/api/v1/announcements?context_codes[]=course_${courseId}&per_page=100`,
				);
			const announcements = [
				...this.snapshot.announcements.filter(
					(announcement) => announcement.course_id !== courseId,
				),
				...records.map((record) => ({ ...record, course_id: courseId })),
			];
			this.setSnapshot({ ...this.snapshot, announcements });
			await this.store.replaceAll("announcements", announcements);
			this.finishScope("announcements");
		} catch (error) {
			this.failScope("announcements", error, "Unable to sync announcements.");
		}
	}

	async syncPages(courseId: number) {
		this.setScope("pages", { status: "syncing", pendingJobs: 1 });
		try {
			const account = this.getSyncAccount();
			const observedAt = new Date().toISOString();
			const { resources: records } = await fetchNormalizedCourseSearchContent(
				this.options.canvasTransport,
				account,
				courseId,
				observedAt,
				[
					this.snapshot.courses.find((course) => course.id === courseId)
						?.syllabus_body,
				],
			);
			const resources = [
				...this.snapshot.resources.filter(
					(resource) => resource.course_id !== courseId,
				),
				...records,
			];
			this.setSnapshot({ ...this.snapshot, resources });
			await this.store.applySnapshot({
				account,
				scope: "resources",
				scopeKey: String(courseId),
				generationId: crypto.randomUUID(),
				observedAt,
				records,
			});
			this.finishScope("pages");
		} catch (error) {
			this.failScope("pages", error, "Unable to sync pages.");
		}
	}

	async syncPage(courseId: number, pageUrl: string) {
		this.setScope("pages", { status: "syncing", pendingJobs: 1 });
		try {
			const record = await this.options.canvasTransport.request<CanvasPage>(
				`/api/v1/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`,
			);
			const resource = await normalizeCanvasResource(
				record,
				this.getSyncAccount(),
				courseId,
				"page",
				new Date().toISOString(),
			);
			const resources = [
				...this.snapshot.resources.filter(
					(candidate) => candidate.id !== resource.id,
				),
				resource,
			];
			this.setSnapshot({ ...this.snapshot, resources });
			await this.store.put("resources", resource);
			this.finishScope("pages");
		} catch (error) {
			this.failScope("pages", error, "Unable to sync this page.");
		}
	}

	async syncQuizzes(courseId: number) {
		this.setScope("quizzes", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasQuiz>(
					`/api/v1/courses/${courseId}/quizzes?per_page=100`,
				);
			const quizzes = [
				...this.snapshot.quizzes.filter((quiz) => quiz.course_id !== courseId),
				...records.map((record) => ({ ...record, course_id: courseId })),
			];
			this.setSnapshot({ ...this.snapshot, quizzes });
			await this.store.replaceAll("quizzes", quizzes);
			this.finishScope("quizzes");
		} catch (error) {
			this.failScope("quizzes", error, "Unable to sync quizzes.");
		}
	}

	async syncQuiz(courseId: number, quizId: number) {
		this.setScope("quizzes", { status: "syncing", pendingJobs: 1 });
		try {
			const record = await this.options.canvasTransport.request<CanvasQuiz>(
				`/api/v1/courses/${courseId}/quizzes/${quizId}`,
			);
			const quiz = { ...record, id: quizId, course_id: courseId };
			const quizzes = [
				...this.snapshot.quizzes.filter(
					(candidate) =>
						!(candidate.course_id === courseId && candidate.id === quizId),
				),
				quiz,
			];
			this.setSnapshot({ ...this.snapshot, quizzes });
			await this.store.replaceAll("quizzes", quizzes);
			this.finishScope("quizzes");
		} catch (error) {
			this.failScope("quizzes", error, "Unable to sync this quiz.");
		}
	}

	async syncDiscussions(courseId: number) {
		this.setScope("discussions", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasDiscussionTopic>(
					`/api/v1/courses/${courseId}/discussion_topics?order_by=recent_activity&per_page=100`,
				);
			const discussions = [
				...this.snapshot.discussions.filter(
					(discussion) => discussion.course_id !== courseId,
				),
				...records.map((record) => ({ ...record, course_id: courseId })),
			];
			this.setSnapshot({ ...this.snapshot, discussions });
			await this.store.replaceAll("discussions", discussions);
			this.finishScope("discussions");
		} catch (error) {
			this.failScope("discussions", error, "Unable to sync discussions.");
		}
	}

	async syncDiscussion(courseId: number, topicId: number) {
		this.setScope("discussion-entries", { status: "syncing", pendingJobs: 1 });
		try {
			const view = await this.options.canvasTransport.request<{
				view?: CanvasDiscussionEntry[];
				entries?: CanvasDiscussionEntry[];
			}>(`/api/v1/courses/${courseId}/discussion_topics/${topicId}/view`);
			const records = view.view ?? view.entries ?? [];
			const normalizeEntry = (
				entry: CanvasDiscussionEntry,
			): CanvasDiscussionEntry => ({
				...entry,
				course_id: courseId,
				topic_id: topicId,
				replies: entry.replies?.map(normalizeEntry),
			});
			const normalized = records.map(normalizeEntry);
			const discussionEntries = [
				...this.snapshot.discussionEntries.filter(
					(entry) =>
						!(entry.course_id === courseId && entry.topic_id === topicId),
				),
				...normalized,
			];
			this.setSnapshot({ ...this.snapshot, discussionEntries });
			await this.store.replaceAll("discussionEntries", discussionEntries);
			this.finishScope("discussion-entries");
		} catch (error) {
			this.failScope(
				"discussion-entries",
				error,
				"Unable to sync this discussion.",
			);
		}
	}

	async addDiscussionEntry(courseId: number, topicId: number, message: string) {
		await this.options.canvasTransport.request<CanvasDiscussionEntry>(
			`/api/v1/courses/${courseId}/discussion_topics/${topicId}/entries`,
			{ method: "POST", body: { message } },
		);
		await this.syncDiscussion(courseId, topicId);
	}

	async addDiscussionReply(
		courseId: number,
		topicId: number,
		entryId: number,
		message: string,
	) {
		await this.options.canvasTransport.request<CanvasDiscussionEntry>(
			`/api/v1/courses/${courseId}/discussion_topics/${topicId}/entries/${entryId}/replies`,
			{ method: "POST", body: { message } },
		);
		await this.syncDiscussion(courseId, topicId);
	}

	async syncFiles(courseId: number) {
		this.setScope("files", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasFile>(
					`/api/v1/courses/${courseId}/files?sort=updated_at&order=desc&per_page=100`,
				);
			const files = [
				...this.snapshot.files.filter((file) => file.course_id !== courseId),
				...records.map((record) => ({ ...record, course_id: courseId })),
			];
			this.setSnapshot({ ...this.snapshot, files });
			await this.store.replaceAll("files", files);
			this.finishScope("files");
		} catch (error) {
			this.failScope("files", error, "Unable to sync files.");
		}
	}

	async syncFile(courseId: number, fileId: number) {
		this.setScope("files", { status: "syncing", pendingJobs: 1 });
		try {
			const [record, publicUrlResponse] = await Promise.all([
				this.options.canvasTransport.request<CanvasFile>(
					`/api/v1/files/${fileId}`,
				),
				this.options.canvasTransport
					.request<{ public_url?: string }>(
						`/api/v1/files/${fileId}/public_url`,
					)
					.catch(() => undefined),
			]);
			const file = {
				...record,
				id: fileId,
				course_id: courseId,
				public_url: publicUrlResponse?.public_url,
				preview_url: record.preview_url,
			};
			const files = [
				...this.snapshot.files.filter(
					(candidate) =>
						!(candidate.course_id === courseId && candidate.id === fileId),
				),
				file,
			];
			this.setSnapshot({ ...this.snapshot, files });
			await this.store.put("files", file);
			this.finishScope("files");
			return file;
		} catch (error) {
			this.failScope("files", error, "Unable to load this file.");
			return undefined;
		}
	}

	async syncCourseTabs(courseId: number) {
		this.setScope("course-tabs", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasCourseTab>(
					`/api/v1/courses/${courseId}/tabs?per_page=100`,
				);
			const normalized = records.map((record) => ({
				...record,
				id: `${courseId}:${record.id}`,
				canvas_tab_id: record.id,
				course_id: courseId,
				label: normalizeCourseTabLabel(record.id, record.label),
			}));
			const courseTabs = [
				...this.snapshot.courseTabs.filter((tab) => tab.course_id !== courseId),
				...normalized,
			];
			this.setSnapshot({ ...this.snapshot, courseTabs });
			await this.store.replaceAll("courseTabs", courseTabs);
			this.finishScope("course-tabs");
		} catch (error) {
			this.failScope("course-tabs", error, "Unable to sync course navigation.");
		}
	}

	async syncPlanner() {
		this.setScope("planner", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasPlannerItem>(
					"/api/v1/planner/items?per_page=100",
				);
			const plannerItems = records.map((record) => ({
				...record,
				id: `${record.plannable_type}:${record.plannable_id}:${record.plannable_date ?? ""}`,
			}));
			this.setSnapshot({ ...this.snapshot, plannerItems });
			await this.store.replaceAll("plannerItems", plannerItems);
			this.finishScope("planner");
		} catch (error) {
			this.failScope("planner", error, "Unable to sync the planner.");
		}
	}

	async syncCalendar(contextCodes = calendarContextCodes(this.snapshot)) {
		const generation = ++this.calendarSyncGeneration;
		const contextGroups = chunk(contextCodes, 10);
		const requestPaths =
			contextGroups.length > 0
				? contextGroups.map((contexts) => calendarEventsPath(contexts))
				: [calendarEventsPath([])];
		this.setScope("calendar", {
			status: "syncing",
			pendingJobs: requestPaths.length,
		});
		try {
			const eventGroups = await Promise.all(
				requestPaths.map((path) =>
					this.options.canvasTransport.paginatedRequest<CanvasCalendarItem>(
						path,
					),
				),
			);
			const calendarItems = eventGroups.flat().map((record, index) => ({
				...record,
				id: String(
					record.id ?? `${record.context_code ?? "calendar"}:${index}`,
				),
			}));
			if (generation !== this.calendarSyncGeneration) return;
			this.setSnapshot({ ...this.snapshot, calendarItems });
			await this.store.replaceAll("calendarItems", calendarItems);
			this.finishScope("calendar");
		} catch (error) {
			if (generation !== this.calendarSyncGeneration) return;
			this.failScope("calendar", error, "Unable to sync the calendar.");
		}
	}

	async setPlannerItemComplete(
		item: CanvasPlannerItem,
		markedComplete: boolean,
	) {
		const previousOverride = item.planner_override;
		const optimisticOverride = {
			...(previousOverride ?? {}),
			marked_complete: markedComplete,
		};
		const applyOverride = (override: CanvasPlannerItem["planner_override"]) => {
			const plannerItems = this.snapshot.plannerItems.map((candidate) =>
				candidate.id === item.id
					? { ...candidate, planner_override: override }
					: candidate,
			);
			this.setSnapshot({ ...this.snapshot, plannerItems });
			return this.store.replaceAll("plannerItems", plannerItems);
		};

		await applyOverride(optimisticOverride);
		try {
			const override = item.planner_override?.id
				? await this.options.canvasTransport.request<
						CanvasPlannerItem["planner_override"]
					>(`/api/v1/planner/overrides/${item.planner_override.id}`, {
						method: "PUT",
						body: { marked_complete: markedComplete },
					})
				: await this.options.canvasTransport.request<
						CanvasPlannerItem["planner_override"]
					>("/api/v1/planner/overrides", {
						method: "POST",
						body: {
							plannable_type: item.plannable_type.toLowerCase(),
							plannable_id: item.plannable_id,
							marked_complete: markedComplete,
						},
					});
			await applyOverride(override ?? optimisticOverride);
		} catch (error) {
			await applyOverride(previousOverride);
			throw error;
		}
	}

	async createPlannerNote(input: {
		title: string;
		details?: string;
		todoDate: string;
		courseId?: number;
	}) {
		await this.options.canvasTransport.request<Record<string, unknown>>(
			"/api/v1/planner_notes",
			{
				method: "POST",
				body: {
					title: input.title,
					details: input.details,
					todo_date: input.todoDate,
					course_id: input.courseId,
				},
			},
		);
		await this.syncPlanner();
	}

	async syncConversations() {
		this.setScope("conversations", { status: "syncing", pendingJobs: 1 });
		try {
			const records =
				await this.options.canvasTransport.paginatedRequest<CanvasConversation>(
					"/api/v1/conversations?scope=inbox&per_page=100",
				);
			const conversations = records.map((record) => ({
				...record,
				id: String(record.id),
			}));
			this.setSnapshot({ ...this.snapshot, conversations });
			await this.store.replaceAll("conversations", conversations);
			this.finishScope("conversations");
		} catch (error) {
			this.failScope("conversations", error, "Unable to sync messages.");
		}
	}

	async syncConversation(conversationId: string) {
		this.setScope("conversations", { status: "syncing", pendingJobs: 1 });
		try {
			const record =
				await this.options.canvasTransport.request<CanvasConversation>(
					`/api/v1/conversations/${encodeURIComponent(conversationId)}?auto_mark_as_read=true`,
				);
			const conversation = { ...record, id: String(record.id) };
			const conversations = [
				...this.snapshot.conversations.filter(
					(candidate) => candidate.id !== conversation.id,
				),
				conversation,
			];
			this.setSnapshot({ ...this.snapshot, conversations });
			await this.store.replaceAll("conversations", conversations);
			this.finishScope("conversations");
		} catch (error) {
			this.failScope(
				"conversations",
				error,
				"Unable to sync this conversation.",
			);
		}
	}

	async addConversationMessage(conversationId: string, body: string) {
		await this.options.canvasTransport.request<CanvasConversation>(
			`/api/v1/conversations/${encodeURIComponent(conversationId)}/add_message`,
			{ method: "POST", body: { body } },
		);
		await this.syncConversation(conversationId);
	}

	async createConversation(input: {
		recipients: Array<string | number>;
		subject?: string;
		body: string;
	}) {
		await this.options.canvasTransport.request<CanvasConversation[]>(
			"/api/v1/conversations",
			{
				method: "POST",
				body: {
					recipients: input.recipients.map(String),
					subject: input.subject,
					body: input.body,
					group_conversation: input.recipients.length > 1,
				},
			},
		);
		await this.syncConversations();
	}

	async syncNotificationPreferences() {
		this.setScope("notifications", { status: "syncing", pendingJobs: 1 });
		try {
			const communicationChannels =
				await this.options.canvasTransport.paginatedRequest<CanvasCommunicationChannel>(
					"/api/v1/users/self/communication_channels?per_page=100",
				);
			const preferenceGroups = await Promise.all(
				communicationChannels.map(async (channel) => {
					const records =
						await this.options.canvasTransport.paginatedRequest<CanvasNotificationPreference>(
							`/api/v1/users/self/communication_channels/${channel.id}/notification_preferences?per_page=100`,
						);
					return records.map((record) => ({
						...record,
						id: `${channel.id}:${record.notification}`,
						channel_id: channel.id,
					}));
				}),
			);
			const notificationPreferences = preferenceGroups.flat();
			this.setSnapshot({
				...this.snapshot,
				communicationChannels,
				notificationPreferences,
			});
			await Promise.all([
				this.store.replaceAll("communicationChannels", communicationChannels),
				this.store.replaceAll(
					"notificationPreferences",
					notificationPreferences,
				),
			]);
			this.finishScope("notifications");
		} catch (error) {
			this.failScope(
				"notifications",
				error,
				"Unable to sync notification settings.",
			);
		}
	}

	async updateNotificationPreference(
		preference: CanvasNotificationPreference,
		frequency: CanvasNotificationPreference["frequency"],
	) {
		await this.options.canvasTransport.request<CanvasNotificationPreference>(
			`/api/v1/users/self/communication_channels/${preference.channel_id}/notification_preferences/${encodeURIComponent(preference.notification)}`,
			{
				method: "PUT",
				body: { notification_preferences: { frequency } },
			},
		);
		const notificationPreferences = this.snapshot.notificationPreferences.map(
			(candidate) =>
				candidate.id === preference.id
					? { ...candidate, frequency }
					: candidate,
		);
		this.setSnapshot({ ...this.snapshot, notificationPreferences });
		await this.store.replaceAll(
			"notificationPreferences",
			notificationPreferences,
		);
	}

	async syncModules(courseId: number) {
		this.setScope("modules", { status: "syncing", pendingJobs: 1 });
		try {
			const modules =
				await this.options.canvasTransport.paginatedRequest<CanvasModule>(
					`/api/v1/courses/${courseId}/modules?per_page=100`,
				);
			const modulesWithItems = await Promise.all(
				modules.map(async (module) => {
					const items =
						await this.options.canvasTransport.paginatedRequest<CanvasModuleItem>(
							`/api/v1/courses/${courseId}/modules/${module.id}/items?include[]=content_details&per_page=100`,
						);
					return {
						...module,
						course_id: courseId,
						items: items.map((item) => ({
							...item,
							module_id: module.id,
						})),
					};
				}),
			);
			const nextModules = [
				...this.snapshot.modules.filter(
					(module) => module.course_id !== courseId,
				),
				...modulesWithItems,
			];
			this.setSnapshot({ ...this.snapshot, modules: nextModules });
			await this.store.replaceAll("modules", nextModules);
			this.setScope("modules", {
				status: "idle",
				pendingJobs: 0,
				lastSyncedAt: new Date().toISOString(),
			});
		} catch (error) {
			this.setScope("modules", {
				status: "error",
				pendingJobs: 0,
				error:
					error instanceof Error ? error.message : "Unable to sync modules.",
			});
		}
	}

	async getModuleItemSequence(
		courseId: number,
		assetType: CanvasModuleItemAssetType,
		assetId: number | string,
	) {
		const cacheKey = moduleItemSequenceCacheKey(courseId, assetType, assetId);
		const cached = this.moduleItemSequenceCache.get(cacheKey);
		if (cached) return cached;

		const pending = this.moduleItemSequenceRequests.get(cacheKey);
		if (pending) return pending;

		const query = new URLSearchParams({
			asset_type: assetType,
			asset_id: String(assetId),
		});
		const request = this.options.canvasTransport
			.request<CanvasModuleItemSequence>(
				`/api/v1/courses/${courseId}/module_item_sequence?${query}`,
			)
			.then((sequence) => {
				this.moduleItemSequenceCache.set(cacheKey, sequence);
				return sequence;
			})
			.finally(() => this.moduleItemSequenceRequests.delete(cacheKey));
		this.moduleItemSequenceRequests.set(cacheKey, request);
		return request;
	}

	getCachedModuleItemSequence(
		courseId: number,
		assetType: CanvasModuleItemAssetType,
		assetId: number | string,
	) {
		return this.moduleItemSequenceCache.get(
			moduleItemSequenceCacheKey(courseId, assetType, assetId),
		);
	}

	prefetchAdjacentModuleItemSequences(
		courseId: number,
		assetType: CanvasModuleItemAssetType,
		sequence: CanvasModuleItemSequence,
	) {
		const node = sequence.items[0];
		for (const item of [node?.prev, node?.next]) {
			const assetId = moduleItemAssetId(item, assetType);
			if (assetId !== undefined) {
				void this.getModuleItemSequence(courseId, assetType, assetId).catch(
					() => undefined,
				);
			}
		}
	}

	async syncAssignment(courseId: number, assignmentId: number) {
		this.setScope("assignments", { status: "syncing", pendingJobs: 1 });
		try {
			const assignment =
				await this.options.canvasTransport.request<CanvasAssignment>(
					`/api/v1/courses/${courseId}/assignments/${assignmentId}?include[]=submission&include[]=rubric_assessment&include[]=score_statistics`,
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
					error instanceof Error ? error.message : "Unable to sync assignment.",
			});
		}
	}

	async syncSubmission(courseId: number, assignmentId: number) {
		this.setScope("submissions", { status: "syncing", pendingJobs: 1 });
		try {
			const record =
				await this.options.canvasTransport.request<CanvasSubmission>(
					`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions/self?include[]=submission_history&include[]=submission_comments&include[]=rubric_assessment`,
				);
			const submission: CanvasSubmission = {
				...record,
				id: `${courseId}:${assignmentId}:self`,
				course_id: courseId,
				assignment_id: assignmentId,
			};
			const submissions = [
				...this.snapshot.submissions.filter(
					(candidate) =>
						!(
							candidate.course_id === courseId &&
							candidate.assignment_id === assignmentId
						),
				),
				submission,
			];
			this.setSnapshot({ ...this.snapshot, submissions });
			await this.store.replaceAll("submissions", submissions);
			this.finishScope("submissions");
			return submission;
		} catch (error) {
			this.failScope("submissions", error, "Unable to sync your submission.");
			return undefined;
		}
	}

	async submitAssignment(
		courseId: number,
		assignmentId: number,
		input: CanvasSubmissionInput,
	) {
		this.setScope("submissions", { status: "syncing", pendingJobs: 1 });
		try {
			await this.options.canvasTransport.request<CanvasSubmission>(
				`/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions`,
				{
					method: "POST",
					body: {
						submission: {
							submission_type: input.type,
							...(input.type === "online_text_entry"
								? { body: input.text ?? "" }
								: { url: input.url ?? "" }),
						},
					},
				},
			);
			return await this.syncSubmission(courseId, assignmentId);
		} catch (error) {
			this.failScope("submissions", error, "Unable to submit this assignment.");
			throw error;
		}
	}

	async getExternalToolLaunch(courseId: number, assignmentId: number) {
		if (
			this.snapshot.mode === "extension" ||
			this.snapshot.activeAccount?.authMode === "canvas-session"
		) {
			const canvasBaseUrl =
				this.snapshot.canvasAuth.status === "authenticated"
					? this.snapshot.canvasAuth.baseUrl
					: this.snapshot.activeAccount?.canvasBaseUrl;
			if (!canvasBaseUrl) {
				throw new Error("The active Canvas session is not ready.");
			}
			return {
				url: new URL(
					`/courses/${courseId}/assignments/${assignmentId}/tool_launch`,
					canvasBaseUrl,
				).toString(),
			} satisfies CanvasExternalToolLaunch;
		}

		const params = new URLSearchParams({
			assignment_id: String(assignmentId),
			launch_type: "assessment",
		});

		return this.options.canvasTransport.request<CanvasExternalToolLaunch>(
			`/api/v1/courses/${courseId}/external_tools/sessionless_launch?${params.toString()}`,
		);
	}

	async listAssignmentComments(
		courseId: number,
		assignmentId: number,
	): Promise<AssignmentComment[]> {
		return this.options.overlayTransport.listAssignmentComments(
			this.assignmentCommentTarget(courseId, assignmentId),
		);
	}

	async createAssignmentComment(
		courseId: number,
		assignmentId: number,
		content: string,
	): Promise<AssignmentComment> {
		return this.options.overlayTransport.createAssignmentComment({
			canvasUserId:
				this.snapshot.activeAccount?.canvasUserId ??
				(this.snapshot.canvasAuth.status === "authenticated"
					? String(this.snapshot.canvasAuth.user.id)
					: this.snapshot.mode === "mock"
						? "mock-canvas-user"
						: (() => {
								throw new Error("The active Canvas user is not ready.");
							})()),
			...this.assignmentCommentTarget(courseId, assignmentId),
			content,
		});
	}

	private assignmentCommentTarget(courseId: number, assignmentId: number) {
		if (this.snapshot.appAuth.status !== "authenticated") {
			throw new Error("Sign in to Canvas V5 to use assignment comments.");
		}
		const canvasBaseUrl =
			this.snapshot.activeAccount?.canvasBaseUrl ??
			(this.snapshot.canvasAuth.status === "authenticated"
				? this.snapshot.canvasAuth.baseUrl
				: undefined);
		if (!canvasBaseUrl) {
			throw new Error("No active Canvas account is available.");
		}
		return {
			canvasDomain: new URL(canvasBaseUrl).hostname.toLowerCase(),
			canvasCourseId: courseId,
			canvasAssignmentId: assignmentId,
		};
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
		return this.updateCourseOverlay(canvasCourseId, { icon });
	}

	async updateCourseHiddenTabs(canvasCourseId: number, hiddenTabIds: string[]) {
		return this.updateCourseOverlay(canvasCourseId, {
			hiddenTabIds: [
				...new Set(
					hiddenTabIds
						.map((tabId) => tabId.trim())
						.filter((tabId) => tabId && tabId !== "home"),
				),
			],
		});
	}

	private async updateCourseOverlay(
		canvasCourseId: number,
		patch: Pick<CourseOverlay, "icon" | "hiddenTabIds">,
	) {
		const activeAccount = this.snapshot.activeAccount;
		if (!activeAccount) {
			throw new Error("No active Canvas account.");
		}

		const now = new Date().toISOString();
		const existingOverlay = selectCourseOverlay(this.snapshot, canvasCourseId);
		const optimisticOverlay: CourseOverlay = {
			...existingOverlay,
			id: `${activeAccount.connectionId}:${canvasCourseId}`,
			canvasConnectionId: activeAccount.connectionId,
			canvasCourseId,
			...patch,
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
			payload: patch,
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
					...patch,
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

	private getSyncAccount(): CanvasAccountRef {
		const activeAccount = this.snapshot.activeAccount;
		if (activeAccount) {
			return {
				id: activeAccount.canvasIdentityId ?? activeAccount.connectionId,
				baseUrl: activeAccount.canvasBaseUrl,
				canvasUserId: activeAccount.canvasUserId,
			};
		}
		if (this.snapshot.canvasAuth.status === "authenticated") {
			return {
				id: `${this.snapshot.canvasAuth.baseUrl}:${this.snapshot.canvasAuth.user.id}`,
				baseUrl: this.snapshot.canvasAuth.baseUrl,
				canvasUserId: String(this.snapshot.canvasAuth.user.id),
			};
		}
		throw new Error("No active Canvas account.");
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
			canvasUserName: canvasAuth.user.name,
			canvasAvatarUrl: canvasAuth.user.avatar_url,
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

	private finishScope(scope: SyncScope, patch: Partial<SyncScopeState> = {}) {
		this.setScope(scope, {
			status: "idle",
			pendingJobs: 0,
			lastSyncedAt: new Date().toISOString(),
			error: undefined,
			...patch,
		});
	}

	private failScope(scope: SyncScope, error: unknown, fallback: string) {
		this.setScope(scope, {
			status: "error",
			pendingJobs: 0,
			error: error instanceof Error ? error.message : fallback,
		});
	}

	private setScope(scope: SyncScope, patch: Partial<SyncScopeState>) {
		const hasScope = this.snapshot.syncScopes.some(
			(item) => item.scope === scope,
		);
		const syncScopes = hasScope
			? this.snapshot.syncScopes.map((item) =>
					item.scope === scope ? { ...item, ...patch } : item,
				)
			: [
					...this.snapshot.syncScopes,
					{ scope, status: "idle" as const, pendingJobs: 0, ...patch },
				];
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
	const courses = useCanvasSnapshot().courses;
	return useMemo(
		() =>
			stableSortByLabel(
				courses,
				(course) => course.name,
				(course) => course.id,
			),
		[courses],
	);
}

export function useCourse(courseId: number | string) {
	const normalizedCourseId = Number(courseId);
	return useCourses().find((course) => course.id === normalizedCourseId);
}

export function useCourseHome(
	courseId: number | string,
	defaultView?: CanvasCourseDefaultView,
) {
	const runtime = useCanvasRuntime();
	const courseHomes = useCanvasSnapshot().courseHomes;
	const normalizedCourseId = Number(courseId);

	useEffect(() => {
		if (Number.isFinite(normalizedCourseId) && defaultView) {
			void runtime.syncCourseHome(normalizedCourseId, defaultView);
		}
	}, [defaultView, normalizedCourseId, runtime]);

	return courseHomes.find((home) => home.course_id === normalizedCourseId);
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

	return useMemo(() => {
		const visibleAssignments =
			normalizedCourseId === undefined
				? assignments
				: assignments.filter(
						(assignment) => assignment.course_id === normalizedCourseId,
					);
		return stableSortByDate(
			visibleAssignments,
			(assignment) => assignment.due_at,
			"ascending",
			{
				getLabel: (assignment) => assignment.name,
				getId: (assignment) => assignment.id,
			},
		);
	}, [assignments, normalizedCourseId]);
}

export function useCoursePeople(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const people = useCanvasSnapshot().people;
	const normalizedCourseId = Number(courseId);

	useEffect(() => {
		if (Number.isFinite(normalizedCourseId)) {
			void runtime.syncPeople(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);

	return useMemo(
		() =>
			stableSortByLabel(
				people.filter((person) => person.course_id === normalizedCourseId),
				(person) => person.sortable_name ?? person.name,
				(person) => person.canvas_user_id,
			),
		[normalizedCourseId, people],
	);
}

export function useAllCoursePeople() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const courseIds = snapshot.courses.map((course) => course.id).join(",");
	useEffect(() => {
		if (courseIds) {
			void Promise.all(
				courseIds
					.split(",")
					.map((courseId) => runtime.syncPeople(Number(courseId))),
			);
		}
	}, [courseIds, runtime]);
	return useMemo(
		() =>
			stableSortByLabel(
				snapshot.people,
				(person) => person.sortable_name ?? person.name,
				(person) => person.id,
			),
		[snapshot.people],
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
	const runtime = useCanvasRuntime();
	const modules = useCanvasSnapshot().modules;
	const normalizedCourseId =
		courseId === undefined ? undefined : Number(courseId);

	useEffect(() => {
		if (
			normalizedCourseId !== undefined &&
			Number.isFinite(normalizedCourseId)
		) {
			void runtime.syncModules(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);

	return normalizedCourseId === undefined
		? modules
		: modules.filter((module) => module.course_id === normalizedCourseId);
}

export function useModuleItemSequence(
	courseId: number | string,
	assetType: CanvasModuleItemAssetType,
	assetId: number | string,
) {
	const runtime = useCanvasRuntime();
	const normalizedCourseId = Number(courseId);
	const cachedSequence = Number.isFinite(normalizedCourseId)
		? runtime.getCachedModuleItemSequence(
				normalizedCourseId,
				assetType,
				assetId,
			)
		: undefined;
	const [state, setState] = useState<{
		sequence?: CanvasModuleItemSequence;
		loading: boolean;
		error?: string;
	}>({ sequence: cachedSequence, loading: !cachedSequence });

	useEffect(() => {
		if (!Number.isFinite(normalizedCourseId)) {
			setState({ loading: false, error: "Invalid course ID." });
			return;
		}

		const controller = new AbortController();
		const cached = runtime.getCachedModuleItemSequence(
			normalizedCourseId,
			assetType,
			assetId,
		);
		setState((current) => ({
			sequence: cached ?? current.sequence,
			loading: !cached,
		}));
		void runtime
			.getModuleItemSequence(normalizedCourseId, assetType, assetId)
			.then((sequence) => {
				if (!controller.signal.aborted) {
					setState({ loading: false, sequence });
				}
				runtime.prefetchAdjacentModuleItemSequences(
					normalizedCourseId,
					assetType,
					sequence,
				);
			})
			.catch((error) => {
				if (!controller.signal.aborted) {
					setState({
						loading: false,
						error:
							error instanceof Error
								? error.message
								: "Unable to load course navigation.",
					});
				}
			});

		return () => controller.abort();
	}, [assetId, assetType, normalizedCourseId, runtime]);

	return state;
}

function moduleItemSequenceCacheKey(
	courseId: number,
	assetType: CanvasModuleItemAssetType,
	assetId: number | string,
) {
	return `${courseId}:${assetType}:${String(assetId)}`;
}

function moduleItemAssetId(
	item: CanvasModuleItem | null | undefined,
	assetType: CanvasModuleItemAssetType,
) {
	if (!item) return undefined;
	if (assetType === "Page") return item.page_url;
	if (assetType === "ModuleItem") return item.id;
	return item.content_id;
}

export function useAnnouncements(courseId?: number | string) {
	const runtime = useCanvasRuntime();
	const announcements = useCanvasSnapshot().announcements;
	const normalizedCourseId =
		courseId === undefined ? undefined : Number(courseId);
	useEffect(() => {
		if (
			normalizedCourseId !== undefined &&
			Number.isFinite(normalizedCourseId)
		) {
			void runtime.syncAnnouncements(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);
	return useMemo(() => {
		const visibleAnnouncements =
			normalizedCourseId === undefined
				? announcements
				: announcements.filter(
						(announcement) => announcement.course_id === normalizedCourseId,
					);
		return stableSortByDate(
			visibleAnnouncements,
			(announcement) => announcement.posted_at,
			"descending",
			{
				getLabel: (announcement) => announcement.title,
				getId: (announcement) => announcement.id,
			},
		);
	}, [announcements, normalizedCourseId]);
}

export function usePages(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const resources = useCanvasSnapshot().resources;
	const normalizedCourseId = Number(courseId);
	const pages = useMemo(
		() =>
			resources.flatMap((resource) => {
				const page = canvasPageFromResource(resource, false);
				return page?.course_id === normalizedCourseId ? [page] : [];
			}),
		[normalizedCourseId, resources],
	);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId) && pages.length === 0)
			void runtime.syncPages(normalizedCourseId);
	}, [normalizedCourseId, pages.length, runtime]);
	return useMemo(
		() =>
			stableSortByDate(pages, (page) => page.created_at, "descending", {
				getLabel: (page) => page.title,
				getId: (page) => page.page_id,
			}),
		[pages],
	);
}

export function usePage(courseId: number | string, pageUrl: string) {
	const runtime = useCanvasRuntime();
	const resources = useCanvasSnapshot().resources;
	const normalizedCourseId = Number(courseId);
	const page = useMemo(
		() => selectCachedPage(resources, normalizedCourseId, pageUrl),
		[normalizedCourseId, pageUrl, resources],
	);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId) && pageUrl && !page) {
			void runtime.syncPage(normalizedCourseId, pageUrl);
		}
	}, [normalizedCourseId, page, pageUrl, runtime]);
	return page;
}

export function selectCachedPage(
	resources: CanvasRuntimeSnapshot["resources"],
	courseId: number,
	pageUrl: string,
): CanvasPage | undefined {
	const resource = resources.find(
		(candidate) =>
			candidate.course_id === courseId &&
			candidate.resourceType === "page" &&
			candidate.canvasResourceId === pageUrl,
	);
	return resource ? canvasPageFromResource(resource, true) : undefined;
}

function canvasPageFromResource(
	resource: CanvasRuntimeSnapshot["resources"][number],
	requireBody: boolean,
): CanvasPage | undefined {
	if (resource.resourceType !== "page") return undefined;
	if (requireBody && resource.body == null) return undefined;
	const metadata = resource.metadata ?? {};
	const pageId = Number(metadata.page_id);
	return {
		canvasAccountId: resource.canvasAccountId,
		id: `${resource.course_id}:${resource.canvasResourceId}`,
		course_id: resource.course_id,
		page_id: Number.isSafeInteger(pageId) ? pageId : 0,
		url: resource.canvasResourceId,
		title: resource.title,
		body: resource.body,
		html_url: resource.html_url,
		created_at: optionalMetadataString(metadata.created_at),
		updated_at: resource.updated_at ?? undefined,
		published: optionalMetadataBoolean(metadata.published),
		front_page: optionalMetadataBoolean(metadata.front_page),
		locked_for_user: optionalMetadataBoolean(metadata.locked_for_user),
		lock_explanation: optionalMetadataString(metadata.lock_explanation),
	};
}

function optionalMetadataString(value: unknown) {
	return typeof value === "string" ? value : undefined;
}

function optionalMetadataBoolean(value: unknown) {
	return typeof value === "boolean" ? value : undefined;
}

export function useQuizzes(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const quizzes = useCanvasSnapshot().quizzes;
	const normalizedCourseId = Number(courseId);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId))
			void runtime.syncQuizzes(normalizedCourseId);
	}, [normalizedCourseId, runtime]);
	return useMemo(
		() =>
			stableSortByDate(
				quizzes.filter((quiz) => quiz.course_id === normalizedCourseId),
				(quiz) => quiz.due_at,
				"ascending",
				{
					getLabel: (quiz) => quiz.title,
					getId: (quiz) => quiz.id,
				},
			),
		[normalizedCourseId, quizzes],
	);
}

export function useQuiz(courseId: number | string, quizId: number | string) {
	const runtime = useCanvasRuntime();
	const quizzes = useCanvasSnapshot().quizzes;
	const normalizedCourseId = Number(courseId);
	const normalizedQuizId = Number(quizId);
	useEffect(() => {
		if (
			Number.isFinite(normalizedCourseId) &&
			Number.isFinite(normalizedQuizId)
		) {
			void runtime.syncQuiz(normalizedCourseId, normalizedQuizId);
		}
	}, [normalizedCourseId, normalizedQuizId, runtime]);
	return quizzes.find(
		(quiz) =>
			quiz.course_id === normalizedCourseId && quiz.id === normalizedQuizId,
	);
}

export function useDiscussions(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const discussions = useCanvasSnapshot().discussions;
	const normalizedCourseId = Number(courseId);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId)) {
			void runtime.syncDiscussions(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);
	return useMemo(
		() =>
			stableSortByDate(
				discussions.filter(
					(discussion) => discussion.course_id === normalizedCourseId,
				),
				(discussion) => discussion.posted_at,
				"descending",
				{
					getLabel: (discussion) => discussion.title,
					getId: (discussion) => discussion.id,
				},
			),
		[discussions, normalizedCourseId],
	);
}

export function useDiscussion(
	courseId: number | string,
	topicId: number | string,
) {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const normalizedCourseId = Number(courseId);
	const normalizedTopicId = Number(topicId);
	useEffect(() => {
		if (
			Number.isFinite(normalizedCourseId) &&
			Number.isFinite(normalizedTopicId)
		) {
			void Promise.all([
				runtime.syncDiscussions(normalizedCourseId),
				runtime.syncDiscussion(normalizedCourseId, normalizedTopicId),
			]);
		}
	}, [normalizedCourseId, normalizedTopicId, runtime]);
	return {
		topic: snapshot.discussions.find(
			(discussion) =>
				discussion.course_id === normalizedCourseId &&
				discussion.id === normalizedTopicId,
		),
		entries: snapshot.discussionEntries.filter(
			(entry) =>
				entry.course_id === normalizedCourseId &&
				entry.topic_id === normalizedTopicId,
		),
	};
}

export function useFiles(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const files = useCanvasSnapshot().files;
	const normalizedCourseId = Number(courseId);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId))
			void runtime.syncFiles(normalizedCourseId);
	}, [normalizedCourseId, runtime]);
	return useMemo(
		() =>
			stableSortByDate(
				files.filter((file) => file.course_id === normalizedCourseId),
				(file) => file.created_at,
				"descending",
				{
					getLabel: (file) => file.display_name,
					getId: (file) => file.id,
				},
			),
		[files, normalizedCourseId],
	);
}

export function useCourseTabs(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const tabs = useCanvasSnapshot().courseTabs;
	const normalizedCourseId = Number(courseId);
	useEffect(() => {
		if (Number.isFinite(normalizedCourseId)) {
			void runtime.syncCourseTabs(normalizedCourseId);
		}
	}, [normalizedCourseId, runtime]);
	return tabs
		.filter((tab) => tab.course_id === normalizedCourseId && !tab.hidden)
		.sort((a, b) => {
			const externalOrder =
				Number(isExternalCourseTab(a)) - Number(isExternalCourseTab(b));
			return externalOrder || (a.position ?? 0) - (b.position ?? 0);
		});
}

function isExternalCourseTab(tab: CanvasCourseTab) {
	const tabId = tab.canvas_tab_id ?? tab.id;
	return tab.type === "external" || tabId.includes("context_external_tool_");
}

function normalizeCourseTabLabel(id: string, label?: string | null) {
	const normalizedLabel = label?.trim();
	if (normalizedLabel) return normalizedLabel;
	return defaultCourseTabLabels[id] ?? "External tool";
}

const defaultCourseTabLabels: Record<string, string> = {
	home: "Overview",
	announcements: "Announcements",
	modules: "Modules",
	assignments: "Assignments",
	quizzes: "Quizzes",
	pages: "Pages",
	discussions: "Discussions",
	files: "Files",
	people: "People",
	grades: "Grades",
	syllabus: "Syllabus",
	collaborations: "Collaborations",
	conferences: "Conferences",
	outcomes: "Outcomes",
};

export function useSubmission(
	courseId: number | string,
	assignmentId: number | string,
) {
	const runtime = useCanvasRuntime();
	const submissions = useCanvasSnapshot().submissions;
	const normalizedCourseId = Number(courseId);
	const normalizedAssignmentId = Number(assignmentId);
	useEffect(() => {
		if (
			Number.isFinite(normalizedCourseId) &&
			Number.isFinite(normalizedAssignmentId)
		) {
			void runtime.syncSubmission(normalizedCourseId, normalizedAssignmentId);
		}
	}, [normalizedCourseId, normalizedAssignmentId, runtime]);
	return submissions.find(
		(submission) =>
			submission.course_id === normalizedCourseId &&
			submission.assignment_id === normalizedAssignmentId,
	);
}

export function usePlannerItems() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const plannerItems = snapshot.plannerItems;
	const activeConnectionId = snapshot.activeAccount?.connectionId;
	const canvasAuthenticated = snapshot.canvasAuth.status === "authenticated";
	useEffect(() => {
		if (activeConnectionId || canvasAuthenticated) void runtime.syncPlanner();
	}, [activeConnectionId, canvasAuthenticated, runtime]);
	return plannerItems;
}

export function useCalendarItems() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const activeConnectionId = snapshot.activeAccount?.connectionId;
	const canvasAuthenticated = snapshot.canvasAuth.status === "authenticated";
	const contextKey = calendarContextCodes(snapshot).join(",");
	useEffect(() => {
		if (activeConnectionId || canvasAuthenticated) {
			void runtime.syncCalendar(contextKey ? contextKey.split(",") : []);
		}
	}, [activeConnectionId, canvasAuthenticated, contextKey, runtime]);
	return useMemo(() => {
		const events = snapshot.calendarItems.filter(
			(item) => !item.assignment && !String(item.id).startsWith("assignment_"),
		);
		const assignments: CanvasCalendarItem[] = snapshot.assignments.flatMap(
			(assignment) => {
				if (!assignment.due_at) return [];
				return [
					{
						id: `assignment_${assignment.course_id}_${assignment.id}`,
						title: assignment.name,
						start_at: assignment.due_at,
						end_at: assignment.due_at,
						context_code: `course_${assignment.course_id}`,
						html_url: assignment.html_url,
						assignment: {
							id: assignment.id,
							course_id: assignment.course_id,
							name: assignment.name,
							due_at: assignment.due_at,
						},
					} satisfies CanvasCalendarItem,
				];
			},
		);
		return [...events, ...assignments];
	}, [snapshot.assignments, snapshot.calendarItems]);
}

export function useConversations() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	const conversations = snapshot.conversations;
	const activeConnectionId = snapshot.activeAccount?.connectionId;
	const canvasAuthenticated = snapshot.canvasAuth.status === "authenticated";
	useEffect(() => {
		if (activeConnectionId || canvasAuthenticated)
			void runtime.syncConversations();
	}, [activeConnectionId, canvasAuthenticated, runtime]);
	return conversations;
}

export function useConversation(conversationId: string) {
	const runtime = useCanvasRuntime();
	const conversations = useCanvasSnapshot().conversations;
	useEffect(() => {
		if (conversationId) void runtime.syncConversation(conversationId);
	}, [conversationId, runtime]);
	return conversations.find(
		(conversation) => conversation.id === conversationId,
	);
}

export function useNotificationPreferences() {
	const runtime = useCanvasRuntime();
	const snapshot = useCanvasSnapshot();
	useEffect(() => {
		void runtime.syncNotificationPreferences();
	}, [runtime]);
	return {
		channels: snapshot.communicationChannels,
		preferences: snapshot.notificationPreferences,
	};
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

export function useCourseSidebarPreferences(courseId: number | string) {
	const runtime = useCanvasRuntime();
	const normalizedCourseId = Number(courseId);
	const overlay = useCourseOverlay(normalizedCourseId);
	const hiddenTabIds = overlay?.hiddenTabIds ?? [];
	const setHiddenTabIds = useCallback(
		(tabIds: string[]) =>
			runtime.updateCourseHiddenTabs(normalizedCourseId, tabIds),
		[normalizedCourseId, runtime],
	);
	return { hiddenTabIds, setHiddenTabIds };
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
