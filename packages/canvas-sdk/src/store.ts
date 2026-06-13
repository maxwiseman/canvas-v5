import type {
	CanvasAccount,
	CanvasAnnouncement,
	CanvasAssignment,
	CanvasCalendarItem,
	CanvasCourse,
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
	| "assignments"
	| "modules"
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
	"assignments",
	"modules",
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
	| CanvasEnrollment
	| CanvasAssignment
	| CanvasModule
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
		assignments: [],
		modules: [],
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
		"assignments",
		"modules",
		"announcements",
		"submissions",
		"calendar",
		"course-overlays",
	];
	return scopes.map((scope) => ({ scope, status: "idle", pendingJobs: 0 }));
}

export class CanvasIndexedDbStore {
	private dbPromise?: Promise<IDBDatabase>;

	constructor(private readonly databaseName = "canvas-v5-sdk") {}

	async hydrate(mode: CanvasRuntimeMode): Promise<CanvasRuntimeSnapshot> {
		const snapshot = emptySnapshot(mode);
		const [
			accounts,
			connections,
			courses,
			enrollments,
			assignments,
			modules,
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
			this.getAll<CanvasAssignment>("assignments"),
			this.getAll<CanvasModule>("modules"),
			this.getAll<CanvasAnnouncement>("announcements"),
			this.getAll<CanvasSubmission>("submissions"),
			this.getAll<CanvasCalendarItem>("calendarItems"),
			this.getAll<CourseOverlay>("courseOverlays"),
			this.getAll<SyncScopeState>("syncScopes"),
			this.getAll<QueuedMutation>("mutationQueue"),
		]);
		const normalizedConnections =
			connections.length > 0 ? connections : accounts;

		return {
			...snapshot,
			accounts: normalizedConnections,
			activeAccount: normalizedConnections.find((account) => account.isActive),
			courses,
			enrollments,
			assignments,
			modules,
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
			const request = indexedDB.open(this.databaseName, 2);
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
