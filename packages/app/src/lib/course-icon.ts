import type { IconId } from "@canvas-v5/canvas-sdk";

type CourseIconRule = {
	icon: IconId;
	subjects: string[];
};

const courseIconRules: CourseIconRule[] = [
	{ icon: "drafting-compass", subjects: ["GEOM"] },
	{ icon: "chart-column", subjects: ["STAT"] },
	{ icon: "calculator", subjects: ["MATH", "MAT", "ALG", "CALC"] },
	{ icon: "microscope", subjects: ["BIO", "BIOL", "LIFE"] },
	{ icon: "flask", subjects: ["CHEM"] },
	{ icon: "atom", subjects: ["PHYS"] },
	{ icon: "telescope", subjects: ["ASTR"] },
	{ icon: "mountain", subjects: ["GEOL", "GEOS"] },
	{ icon: "leaf", subjects: ["ENV", "ENVS", "ECOL"] },
	{ icon: "code", subjects: ["CS", "CSC", "CPSC", "COSC", "COMP", "IT"] },
	{ icon: "database", subjects: ["DATA", "DSCI", "INFS"] },
	{ icon: "brain-circuit", subjects: ["AI", "ML"] },
	{ icon: "circuit-board", subjects: ["ECE", "EE"] },
	{ icon: "cog", subjects: ["ME", "MENG"] },
	{ icon: "hard-hat", subjects: ["CE", "CIVE", "CIVL"] },
	{ icon: "wrench", subjects: ["EF", "ENGR"] },
	{ icon: "feather", subjects: ["ENG", "ENGL", "LIT", "WRIT"] },
	{ icon: "scroll", subjects: ["HIST"] },
	{ icon: "government", subjects: ["GOV", "POLS", "POLI"] },
	{ icon: "brain", subjects: ["PSY", "PSYC"] },
	{ icon: "users", subjects: ["ANTH", "SOC", "SOCI"] },
	{ icon: "map", subjects: ["GEOG"] },
	{
		icon: "languages",
		subjects: ["ARAB", "CHIN", "FREN", "GERM", "JAPN", "LATN", "SPAN"],
	},
	{ icon: "palette", subjects: ["ART", "ARTH", "DES"] },
	{ icon: "music", subjects: ["MUS", "MUSC"] },
	{ icon: "drama", subjects: ["DRAM", "THEA"] },
	{ icon: "film", subjects: ["CINE", "FILM"] },
	{ icon: "megaphone", subjects: ["COMM", "CMST", "JOUR"] },
	{ icon: "briefcase", subjects: ["BADM", "BUS", "BUSN", "MGMT"] },
	{ icon: "chart-column", subjects: ["ECON"] },
	{ icon: "badge-dollar-sign", subjects: ["ACCT", "FIN", "FINC"] },
	{ icon: "heart-handshake", subjects: ["MKT", "MKTG"] },
	{ icon: "scale", subjects: ["LAW"] },
	{ icon: "gavel", subjects: ["CJ", "CRIM"] },
	{ icon: "stethoscope", subjects: ["MED", "NURS"] },
	{ icon: "activity", subjects: ["ANAT", "PHYSIO"] },
	{ icon: "dumbbell", subjects: ["KINE", "PE", "PHED"] },
	{ icon: "apple", subjects: ["NUTR"] },
	{ icon: "chef-hat", subjects: ["CUL", "CULN"] },
	{ icon: "tractor", subjects: ["AG", "AGRI"] },
	{ icon: "plane", subjects: ["AVIA", "AVTN"] },
];

export function inferCourseIconId(courseCode?: string | null): IconId {
	if (!courseCode) return "book";

	const normalizedCode = courseCode.toUpperCase();
	for (const rule of courseIconRules) {
		if (rule.subjects.some((subject) => hasSubject(normalizedCode, subject))) {
			return rule.icon;
		}
	}

	return "book";
}

export function resolveCourseIconId(
	explicitIcon: IconId | null | undefined,
	courseCode?: string | null,
): IconId {
	return explicitIcon ?? inferCourseIconId(courseCode);
}

function hasSubject(courseCode: string, subject: string) {
	const escapedSubject = subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`(^|[^A-Z])${escapedSubject}(?=$|[^A-Z])`).test(courseCode);
}
