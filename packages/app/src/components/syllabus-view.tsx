import { useCourse, useSyncStatus } from "@canvas-v5/canvas-sdk";
import { CanvasHTML } from "./canvas-html";
import {
	PageHeader,
	PageHeaderContent,
	PageHeaderTitle,
	PageWrapper,
} from "./page-header";
import { ResourceEmpty } from "./resource-empty";

export function SyllabusView({ courseId }: { courseId: string }) {
	const course = useCourse(courseId);
	const coursesSync = useSyncStatus().find(
		(scope) => scope.scope === "courses",
	);

	if (!course) {
		return (
			<PageWrapper className="mx-auto w-full max-w-6xl">
				<ResourceEmpty
					description="This course is unavailable."
					error={
						coursesSync?.status === "error" ? coursesSync.error : undefined
					}
					loading={coursesSync?.status === "syncing"}
					title="Course not found"
				/>
			</PageWrapper>
		);
	}

	const dates = [
		{ label: "Starts", value: formatCourseDate(course.start_at) },
		{ label: "Ends", value: formatCourseDate(course.end_at) },
	].filter((item): item is { label: string; value: string } =>
		Boolean(item.value),
	);

	return (
		<PageWrapper className="mx-auto w-full max-w-6xl">
			<PageHeader>
				<PageHeaderContent>
					<PageHeaderTitle>Syllabus</PageHeaderTitle>
				</PageHeaderContent>
			</PageHeader>

			{course.syllabus_body ? (
				<div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_14rem]">
					<CanvasHTML className="min-w-0">{course.syllabus_body}</CanvasHTML>

					{dates.length > 0 ? (
						<aside className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-8">
							<h2 className="font-medium text-base">Course details</h2>
							<dl className="mt-3 divide-y border-y">
								{dates.map((item) => (
									<div className="py-3" key={item.label}>
										<dt className="font-medium text-sm">{item.label}</dt>
										<dd className="mt-1 text-muted-foreground text-sm">
											{item.value}
										</dd>
									</div>
								))}
							</dl>
						</aside>
					) : null}
				</div>
			) : (
				<ResourceEmpty
					description="No syllabus has been added for this course in Canvas."
					title="No syllabus"
				/>
			)}
		</PageWrapper>
	);
}

function formatCourseDate(value?: string | null) {
	if (!value) return undefined;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}
