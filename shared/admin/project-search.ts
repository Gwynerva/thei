export type SearchableProject = {
  projectUuid: string;
  title: string;
  humanReadableSlug: string;
  publicId: string;
  updatedAt: number;
};

export function rankProjectSearch<T extends SearchableProject>(
  projects: T[],
  query: string,
  limit = 5,
): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) {
    return [...projects]
      .sort(
        (a, b) =>
          b.updatedAt - a.updatedAt ||
          a.title.localeCompare(b.title) ||
          a.projectUuid.localeCompare(b.projectUuid),
      )
      .slice(0, limit);
  }

  return projects
    .map((project) => ({
      project,
      rank: bestRank(project, normalized),
    }))
    .filter((item) => item.rank !== Number.POSITIVE_INFINITY)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.project.title.localeCompare(b.project.title) ||
        a.project.projectUuid.localeCompare(b.project.projectUuid),
    )
    .slice(0, limit)
    .map((item) => item.project);
}

function bestRank(project: SearchableProject, query: string) {
  const fields = [
    project.title.toLocaleLowerCase(),
    project.publicId.toLocaleLowerCase(),
    project.humanReadableSlug.toLocaleLowerCase(),
  ];
  let best = Number.POSITIVE_INFINITY;
  for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex++) {
    const value = fields[fieldIndex]!;
    const matchRank =
      value === query
        ? 0
        : value.startsWith(query)
          ? 1
          : value.includes(query)
            ? 2
            : 3;
    if (matchRank < 3) best = Math.min(best, fieldIndex * 10 + matchRank);
  }
  return best;
}
