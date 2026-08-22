type HastNode = {
	type: string;
	children?: HastNode[];
};

type HastElement = HastNode & {
	type: "element";
	properties?: Record<string, unknown>;
};

const adaptiveProperties = {
	color: "foreground",
	"background-color": "background",
	background: "background",
	"border-color": "border",
	border: "border",
	"border-top-color": "border-top",
	"border-top": "border-top",
	"border-right-color": "border-right",
	"border-right": "border-right",
	"border-bottom-color": "border-bottom",
	"border-bottom": "border-bottom",
	"border-left-color": "border-left",
	"border-left": "border-left",
} as const;

type AdaptiveProperty = keyof typeof adaptiveProperties;
type AdaptiveRole = (typeof adaptiveProperties)[AdaptiveProperty];

const nonColorKeywords = new Set([
	"currentcolor",
	"dashed",
	"dotted",
	"double",
	"groove",
	"inherit",
	"initial",
	"hidden",
	"inset",
	"medium",
	"none",
	"outset",
	"revert",
	"revert-layer",
	"ridge",
	"solid",
	"thick",
	"thin",
	"transparent",
	"unset",
]);

/** Preserve authored colors in light mode and derive hue-preserving dark colors. */
export function rehypeAdaptCanvasHtmlColors() {
	return (tree: HastNode) => {
		visitElements(tree, adaptElementColors);
	};
}

function visitElements(node: HastNode, visitor: (node: HastElement) => void) {
	if (node.type === "element") visitor(node as HastElement);
	for (const child of node.children ?? []) visitElements(child, visitor);
}

function adaptElementColors(node: HastElement) {
	const properties = node.properties ?? {};
	node.properties = properties;
	const style = typeof properties.style === "string" ? properties.style : "";
	const declarations = parseDeclarations(style);
	const adaptedDeclarations: Declaration[] = [];
	const adaptiveClasses = new Set<string>();

	for (const declaration of declarations) {
		const property = declaration.property as AdaptiveProperty;
		const role = adaptiveProperties[property];
		const adaptiveColor = role
			? findAdaptiveColor(property, declaration.value)
			: undefined;
		if (!role || !adaptiveColor) {
			adaptedDeclarations.push(declaration);
			continue;
		}

		adaptedDeclarations.push(
			adaptiveLightColorDeclaration(role, adaptiveColor.lightColor),
			{
				...declaration,
				value: adaptiveColor.adaptedValue,
			},
		);
		adaptiveClasses.add(adaptiveClass(role));
	}

	const legacyBackground = stringProperty(properties.bgColor);
	if (legacyBackground && isSimpleColor(legacyBackground)) {
		adaptedDeclarations.push(
			adaptiveLightColorDeclaration("background", legacyBackground),
			{
				property: "background-color",
				value: "var(--canvas-html-background)",
				important: false,
			},
		);
		delete properties.bgColor;
		adaptiveClasses.add(adaptiveClass("background"));
	}

	const legacyForeground = stringProperty(properties.color);
	if (legacyForeground && isSimpleColor(legacyForeground)) {
		adaptedDeclarations.push(
			adaptiveLightColorDeclaration("foreground", legacyForeground),
			{
				property: "color",
				value: "var(--canvas-html-foreground)",
				important: false,
			},
		);
		delete properties.color;
		adaptiveClasses.add(adaptiveClass("foreground"));
	}

	if (adaptiveClasses.size === 0) return;

	properties.style = serializeDeclarations(adaptedDeclarations);
	properties.className = mergeClassNames(properties.className, adaptiveClasses);
}

type Declaration = {
	property: string;
	value: string;
	important: boolean;
};

export function parseDeclarations(style: string): Declaration[] {
	return splitCss(style, ";").flatMap((part) => {
		const colon = findTopLevelCharacter(part, ":");
		if (colon < 0) return [];

		const property = part.slice(0, colon).trim().toLowerCase();
		const rawValue = part.slice(colon + 1).trim();
		if (!property || !rawValue) return [];

		const important = /\s*!important\s*$/i.test(rawValue);
		const value = important
			? rawValue.replace(/\s*!important\s*$/i, "").trim()
			: rawValue;

		return [{ property, value, important }];
	});
}

function serializeDeclarations(declarations: Declaration[]) {
	return declarations
		.map(
			({ property, value, important }) =>
				`${property}: ${value}${important ? " !important" : ""}`,
		)
		.join("; ");
}

function adaptiveLightColorDeclaration(
	role: AdaptiveRole,
	lightColor: string,
): Declaration {
	return {
		property: `--canvas-html-${role}-light`,
		value: lightColor,
		important: false,
	};
}

function adaptiveClass(role: AdaptiveRole) {
	return `canvas-html-adaptive-${role}`;
}

function findAdaptiveColor(property: AdaptiveProperty, value: string) {
	if (property === "background") {
		return isSimpleColor(value)
			? { lightColor: value, adaptedValue: "var(--canvas-html-background)" }
			: undefined;
	}

	if (
		property === "border" ||
		property === "border-top" ||
		property === "border-right" ||
		property === "border-bottom" ||
		property === "border-left"
	) {
		const color = findLastSimpleColor(splitCss(value, " "));
		if (!color) return undefined;

		const role = adaptiveProperties[property];
		return {
			lightColor: color,
			adaptedValue: replaceLast(value, color, `var(--canvas-html-${role})`),
		};
	}

	const role = adaptiveProperties[property];
	return isSimpleColor(value)
		? { lightColor: value, adaptedValue: `var(--canvas-html-${role})` }
		: undefined;
}

function isSimpleColor(value: string) {
	const normalized = value.trim().toLowerCase();
	if (nonColorKeywords.has(normalized)) return false;
	if (/^#[\da-f]{3,8}$/i.test(normalized)) return true;
	if (/^[a-z]+$/i.test(normalized)) return true;
	return /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\([^;]+\)$/i.test(
		normalized,
	);
}

function findLastSimpleColor(parts: string[]) {
	for (let index = parts.length - 1; index >= 0; index -= 1) {
		const part = parts[index]?.trim();
		if (part && isSimpleColor(part)) return part;
	}
	return undefined;
}

function stringProperty(value: unknown) {
	return typeof value === "string" ? value.trim() : undefined;
}

function replaceLast(value: string, search: string, replacement: string) {
	const index = value.lastIndexOf(search);
	return index < 0
		? value
		: `${value.slice(0, index)}${replacement}${value.slice(index + search.length)}`;
}

function mergeClassNames(value: unknown, additions: Set<string>) {
	const existing = Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: typeof value === "string"
			? value.split(/\s+/).filter(Boolean)
			: [];
	return [...new Set([...existing, ...additions])];
}

function splitCss(value: string, separator: string) {
	const parts: string[] = [];
	let start = 0;
	let depth = 0;
	let quote: '"' | "'" | undefined;

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (quote) {
			if (character === quote && value[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "(") depth += 1;
		if (character === ")") depth = Math.max(0, depth - 1);
		if (character === separator && depth === 0) {
			parts.push(value.slice(start, index));
			start = index + 1;
		}
	}

	parts.push(value.slice(start));
	return parts;
}

function findTopLevelCharacter(value: string, target: string) {
	let depth = 0;
	let quote: '"' | "'" | undefined;

	for (let index = 0; index < value.length; index += 1) {
		const character = value[index];
		if (quote) {
			if (character === quote && value[index - 1] !== "\\") quote = undefined;
			continue;
		}
		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}
		if (character === "(") depth += 1;
		if (character === ")") depth = Math.max(0, depth - 1);
		if (character === target && depth === 0) return index;
	}

	return -1;
}
