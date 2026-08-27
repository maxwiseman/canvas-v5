import {
	type CanvasModuleItem,
	type CanvasModuleItemAssetType,
	useModuleItemSequence,
} from "@canvas-v5/canvas-sdk";
import { Button } from "@canvas-v5/ui/components/button";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { moduleItemLink } from "../lib/module-item-link";

export function CourseSequenceNavigation({
	assetId,
	assetType,
	courseId,
}: {
	assetId: number | string;
	assetType: CanvasModuleItemAssetType;
	courseId: string;
}) {
	const { loading, sequence } = useModuleItemSequence(
		courseId,
		assetType,
		assetId,
	);
	const moduleItemId = useRouterState({
		select: (state) => {
			const rawValue = (state.location.search as Record<string, unknown>)
				.module_item_id;
			const value = Number(rawValue);
			return Number.isFinite(value) ? value : undefined;
		},
	});
	const node =
		sequence?.items.find((item) => item.current.id === moduleItemId) ??
		sequence?.items[0];

	if (!loading && !node) return null;

	return (
		<nav
			aria-label="Course module navigation"
			className="mt-10 flex items-center justify-between gap-3 border-t pt-6"
		>
			<SequenceButton
				courseId={courseId}
				direction="previous"
				item={node?.prev}
				loading={loading}
			/>
			<SequenceButton
				courseId={courseId}
				direction="next"
				item={node?.next}
				loading={loading}
			/>
		</nav>
	);
}

function SequenceButton({
	courseId,
	direction,
	item,
	loading,
}: {
	courseId: string;
	direction: "previous" | "next";
	item?: CanvasModuleItem | null;
	loading: boolean;
}) {
	const label = direction === "previous" ? "Previous" : "Next";
	const icon =
		direction === "previous" ? (
			<ArrowLeft data-icon="inline-start" />
		) : (
			<ArrowRight data-icon="inline-end" />
		);
	const link = item ? moduleItemLink(courseId, item) : undefined;

	if (!link) {
		return (
			<Button
				aria-label={label}
				disabled
				title={loading ? "Loading…" : undefined}
				variant="outline"
			>
				{direction === "previous" ? icon : null}
				{label}
				{direction === "next" ? icon : null}
			</Button>
		);
	}

	const content = (
		<>
			{direction === "previous" ? icon : null}
			{label}
			{direction === "next" ? icon : null}
		</>
	);

	if (link.external) {
		return (
			<Button
				render={
					<a
						aria-label={`${label}: ${item?.title}`}
						href={link.href}
						rel="noreferrer noopener"
						target="_blank"
						title={item?.title}
					>
						<span className="sr-only">{`${label}: ${item?.title}`}</span>
					</a>
				}
				variant="outline"
			>
				{content}
			</Button>
		);
	}

	return (
		<Button
			render={
				<Link
					aria-label={`${label}: ${item?.title}`}
					title={item?.title}
					to={link.href as never}
				/>
			}
			variant="outline"
		>
			{content}
		</Button>
	);
}
