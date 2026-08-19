import type {
	CanvasRecordMetadata,
	CanvasSyncBatch,
	CanvasSyncRepository,
	CanvasSyncResult,
} from "@canvas-v5/canvas-core";
import type {
	CanvasAccount,
	CanvasAnnouncement,
	CanvasAssignment,
	CanvasCalendarItem,
	CanvasCourse,
	CanvasCourseHome,
	CanvasCourseUser,
	CanvasEnrollment,
	CanvasModule,
	CanvasRuntimeMode,
	CanvasRuntimeSnapshot,
	CanvasSubmission,
	CourseOverlay,
	QueuedMutation,
	SyncScope,
	SyncScopeState,
} from "./types";

type StoreName =
	| "accounts"
	| "connections"
	| "courses"
	| "enrollments"
	| "people"
	| "assignments"
	| "modules"
	| "courseHomes"
	| "announcements"
	| "submissions"
	| "calendarItems"
	| "courseOverlays"
	| "syncScopes"
	| "mutationQueue";

const STORE_NAMES: StoreName[] = [
	"accounts",
	"connections",
	"courses",
	"enrollments",
	"people",
	"assignments",
	"modules",
	"courseHomes",
	"announcements",
	"submissions",
	"calendarItems",
	"courseOverlays",
	"syncScopes",
	"mutationQueue",
];

type StoreRecord =
	| CanvasAccount
	| CanvasCourse
	| CanvasCourseUser
	| CanvasEnrollment
	| CanvasAssignment
	| CanvasModule
	| CanvasCourseHome
	| CanvasAnnouncement
	| CanvasSubmission
	| CanvasCalendarItem
	| CourseOverlay
	| SyncScopeState
	| QueuedMutation;

export function emptySnapshot(mode: CanvasRuntimeMode): CanvasRuntimeSnapshot {
	return {
		mode,
		canvasAuth: { status: "checking" },
		appAuth: { status: "checking" },
		accounts: [],
		courses: [],
		enrollments: [],
		people: [],
		assignments: [],
		modules: [],
		courseHomes: [],
		announcements: [],
		submissions: [],
		calendarItems: [],
		courseOverlays: [],
		syncScopes: createInitialSyncScopes(),
		mutationQueue: [],
	};
}

export function createInitialSyncScopes(): SyncScopeState[] {
	const scopes: SyncScope[] = [
		"accounts",
		"courses",
		"enrollments",
		"people",
		"assignments",
		"modules",
		"course-home",
		"announcements",
		"submissions",
		"calendar",
		"course-overlays",
	];
	return scopes.map((scope) => ({ scope, status: "idle", pendingJobs: 0 }));
}

export class CanvasIndexedDbStore implements CanvasSyncRepository {
	private dbPromise?: Promise<IDBDatabase>;

	constructor(private readonly databaseName = "canvas-v5-sdk") {}

	async hydrate(mode: CanvasRuntimeMode): Promise<CanvasRuntimeSnapshot> {
		const snapshot = emptySnapshot(mode);
		const [
			accounts,
			connections,
			courses,
			enrollments,
			people,
			assignments,
			modules,
			courseHomes,
			announcements,
			submissions,
			calendarItems,
			courseOverlays,
			syncScopes,
			mutationQueue,
		] = await Promise.all([
			this.getAll<CanvasAccount>("accounts"),
			this.getAll<CanvasAccount>("connections"),
			this.getAll<CanvasCourse>("courses"),
			this.getAll<CanvasEnrollment>("enrollments"),
			this.getAll<CanvasCourseUser>("people"),
			this.getAll<CanvasAssignment>("assignments"),
			this.getAll<CanvasModule>("modules"),
			this.getAll<CanvasCourseHome>("courseHomes"),
			this.getAll<CanvasAnnouncement>("announcements"),
			this.getAll<CanvasSubmission>("submissions"),
			this.getAll<CanvasCalendarItem>("calendarItems"),
			this.getAll<CourseOverlay>("courseOverlays"),
			this.getAll<SyncScopeState>("syncScopes"),
			this.getAll<QueuedMutation>("mutationQueue"),
		]);
		const normalizedConnections =
			connections.length > 0 ? connections : accounts;
		const activeAccount = normalizedConnections.find(
			(account) => account.isActive,
		);
		const activeAccountId =
			activeAccount?.canvasIdentityId ?? activeAccount?.connectionId;
		const belongsToActiveAccount = (record: unknown) => {
			if (!record || typeof record !== "object" || !activeAccountId) return true;
			const recordAccountId = (record as { canvasAccountId?: unknown })
				.canvasAccountId;
			return recordAccountId === undefined || recordAccountId === activeAccountId;
		};

		return {
			...snapshot,
			accounts: normalizedConnections,
			activeAccount,
			courses: courses.filter(belongsToActiveAccount),
			enrollments,
			people,
			assignments: assignments.filter(belongsToActiveAccount),
			modules,
			courseHomes,
			announcements,
			submissions,
			calendarItems,
			courseOverlays,
			syncScopes: syncScopes.length > 0 ? syncScopes : snapshot.syncScopes,
			mutationQueue,
		};
	}

	async replaceAll(storeName: StoreName, records: StoreRecord[]) {
		const db = await this.open();
		await transactionDone(db, [storeName], "readwrite", (transaction) => {
			const store = transaction.objectStore(storeName);
			store.clear();
			for (const record of records) {
				store.put(record);
			}
		});
	}

	async put(storeName: StoreName, record: StoreRecord) {
		const db = await this.open();
		await transactionDone(db, [storeName], "readwrite", (transaction) => {
			transaction.objectStore(storeName).put(record);
		});
	}

	async applySnapshot<T extends CanvasRecordMetadata>(
		batch: CanvasSyncBatch<T>,
	): Promise<CanvasSyncResult> {
		const storeName = batch.scope;
		const existing = await this.getAll<CanvasRecordMetadata & {
			course_id?: number;
		}>(storeName);
		const scopeCourseId =
			batch.scope === "assignments" ? Number(batch.scopeKey) : undefined;
		const retained = existing.filter((record) => {
			if (record.canvasAccountId !== batch.account.id) return true;
			if (batch.scope === "courses") return false;
			return record.course_id !== scopeCourseId;
		});
		await this.replaceAll(
			storeName,
			[...retained, ...batch.records] as unknown as StoreRecord[],
		);
		return {
			scope: batch.scope,
			scopeKey: batch.scopeKey,
			generationId: batch.generationId,
			observedAt: batch.observedAt,
			recordCount: batch.records.length,
		};
	}

	private async getAll<T>(storeName: StoreName): Promise<T[]> {
		const db = await this.open();
		return new Promise((resolve, reject) => {
			const request = db
				.transaction(storeName, "readonly")
				.objectStore(storeName)
				.getAll();
			request.onsuccess = () => resolve(request.result as T[]);
			request.onerror = () => reject(request.error);
		});
	}

	private open(): Promise<IDBDatabase> {
		if (!("indexedDB" in globalThis)) {
			return Promise.reject(
				new Error("IndexedDB is not available in this runtime."),
			);
		}
		this.dbPromise ??= new Promise((resolve, reject) => {
			const request = indexedDB.open(this.databaseName, 4);
			request.onupgradeneeded = () => {
				const db = request.result;
				for (const storeName of STORE_NAMES) {
					if (!db.objectStoreNames.contains(storeName)) {
						db.createObjectStore(storeName, {
							keyPath: keyPathForStore(storeName),
						});
					}
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.dbPromise;
	}
}

function keyPathForStore(storeName: StoreName) {
	if (storeName === "syncScopes") {
		return "scope";
	}
	return "id";
}

function transactionDone(
	db: IDBDatabase,
	storeNames: StoreName[],
	mode: IDBTransactionMode,
	run: (transaction: IDBTransaction) => void,
) {
	return new Promise<void>((resolve, reject) => {
		const transaction = db.transaction(storeNames, mode);
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error);
		transaction.onabort = () => reject(transaction.error);
		run(transaction);
	});
}
