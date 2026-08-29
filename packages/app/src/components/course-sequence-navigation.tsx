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
	variant = "footer",
}: {
	assetId: number | string;
	assetType: CanvasModuleItemAssetType;
	courseId: string;
	variant?: "footer" | "header";
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
	if (variant === "header" && !node) return null;

	const compact = variant === "header";

	return (
		<nav
			aria-label={compact ? "Page navigation" : "Course module navigation"}
			className={
				compact
					? "flex items-center gap-1"
					: "mt-10 flex items-center justify-between gap-3 border-t pt-6"
			}
		>
			<SequenceButton
				compact={compact}
				courseId={courseId}
				direction="previous"
				item={node?.prev}
				loading={loading}
			/>
			<SequenceButton
				compact={compact}
				courseId={courseId}
				direction="next"
				item={node?.next}
				loading={loading}
			/>
		</nav>
	);
}

function SequenceButton({
	compact,
	courseId,
	direction,
	item,
	loading,
}: {
	compact: boolean;
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
				size={compact ? "icon-sm" : "default"}
				title={loading ? "Loading…" : undefined}
				variant="outline"
			>
				{compact ? icon : direction === "previous" ? icon : null}
				{compact ? <span className="sr-only">{label}</span> : label}
				{compact ? null : direction === "next" ? icon : null}
			</Button>
		);
	}

	const content = (
		<>
			{compact ? icon : direction === "previous" ? icon : null}
			{compact ? <span className="sr-only">{label}</span> : label}
			{compact ? null : direction === "next" ? icon : null}
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
				size={compact ? "icon-sm" : "default"}
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
			size={compact ? "icon-sm" : "default"}
			variant="outline"
		>
			{content}
		</Button>
	);
}
