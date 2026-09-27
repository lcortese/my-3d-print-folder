import { useEffect, useState } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import type {
  ProjectFilters,
  ProjectPagination,
  ProjectSorting,
} from "../../api";
import { useProjects } from "../../hooks/use-projects";
import { Tree } from "@/Trees/components/tree";
import { useTreeRoot } from "@/Trees/hooks/use-tree";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ProjectsTable } from "./table";

export interface ProjectsPageProps {
  filters: ProjectFilters;
  sorting: ProjectSorting;
  pagination: ProjectPagination;
  /** Write these filters into the query string. */
  onFiltersChange: (filters: ProjectFilters) => void;
  /** Write this sorting into the query string. */
  onSortingChange: (sorting: ProjectSorting) => void;
  /** Write this pagination into the query string. */
  onPaginationChange: (pagination: ProjectPagination) => void;
}

/**
 * Projects page: receives its parameters as props, negotiates them with the
 * module hooks and renders the components that present the data.
 */
export function ProjectsPage({
  filters,
  sorting,
  pagination,
  onFiltersChange,
  onSortingChange,
  onPaginationChange,
}: ProjectsPageProps) {
  // Which folders are open in the tree is page state; the tree only asks for it.
  const [expandedPaths, setExpandedPaths] = useState<string[]>([""]);

  // The input holds what is being typed, so it may be empty even when there is
  // no filter set. The parameter itself stays undefined until it has a value.
  const [qSearch, setQSearch] = useState(filters.q);
  const [focusedSearch, setFocusedSearch] = useState(false);
  const debouncedSearch = useDebouncedValue(qSearch);

  const { name: rootName, children: categories } = useTreeRoot();

  const resetSearch = () => {
    setQSearch(filters.q);
  };

  const handleSearchBlur = () => {
    setFocusedSearch(false);
    resetSearch();
  };

  // Adopt a filter applied by something else (history navigation, a link). Our
  // own write is ignored: the navigation commits asynchronously, and syncing it
  // would overwrite the characters typed while it was still in flight.
  useEffect(() => {
    if (focusedSearch || filters.q === qSearch) return;
    resetSearch();
  }, [filters.q]);

  // When the typing paused, the filter travels to the URL; from there it comes
  // back down as a prop and the request is made with what the query string says.
  useEffect(() => {
    if (debouncedSearch === filters.q) return;
    onFiltersChange({ ...filters, q: debouncedSearch });
  }, [debouncedSearch]);

  const projects = useProjects({ filters, sorting, pagination });

  const segments = filters.scope ? filters.scope.split("/") : [];

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-72 shrink-0 border-r border-border bg-card/20 lg:block xl:w-80">
        <Tree
          expandedPaths={expandedPaths}
          scope={filters.scope}
          onExpandedPathsChange={setExpandedPaths}
          onScopeChange={(scope) =>
            onFiltersChange({ ...filters, q: undefined, scope })
          }
        />
      </aside>

      <main className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="proyects-q"
              value={qSearch || ""}
              onChange={(event) => setQSearch(event.target.value)}
              placeholder="Filter projects or model files…"
              aria-label="Filter projects"
              className="pr-8 pl-8"
              onFocus={() => setFocusedSearch(true)}
              onBlur={() => handleSearchBlur()}
            />
            {qSearch ? (
              <button
                type="button"
                aria-label="Clear the filter"
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setQSearch(undefined)}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>

          {/* Breadcrumb of the selected folder. */}
          <nav
            aria-label="Scope"
            className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            <button
              type="button"
              className={cn(
                "rounded px-1 py-0.5 hover:text-foreground",
                !filters.scope && "font-medium text-foreground",
              )}
              onClick={() => onFiltersChange({ ...filters, scope: undefined })}
            >
              {rootName}
            </button>
            {segments.map((segment, index) => {
              const path = segments.slice(0, index + 1).join("/");
              const isLast = index === segments.length - 1;
              return (
                <span key={path} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="size-3 shrink-0 opacity-60" />
                  <button
                    type="button"
                    className={cn(
                      "max-w-[180px] truncate rounded px-1 py-0.5 hover:text-foreground",
                      isLast && "font-medium text-foreground",
                    )}
                    onClick={() => onFiltersChange({ ...filters, scope: path })}
                  >
                    {segment}
                  </button>
                </span>
              );
            })}
          </nav>

          {/* Small screens cannot host the tree: offer a flat category picker. */}
          <div className="ml-auto lg:hidden">
            <Select
              // "all" is the Select sentinel for "no scope": its items cannot
              // carry an empty value.
              value={filters.scope ?? "all"}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  scope: value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger size="sm" className="w-[190px]">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories?.map((category) => (
                  <SelectItem key={category.path} value={category.path}>
                    {category.name} ({category.projectCount})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ProjectsTable
          page={projects.data}
          loading={projects.loading}
          validating={projects.validating}
          error={projects.error}
          currentPage={pagination.page}
          pageSize={pagination.pageSize}
          sort={sorting.sort}
          dir={sorting.dir}
          search={filters.q}
          onSortChange={(sort, dir) =>
            onSortingChange({ ...sorting, sort, dir })
          }
          onPageChange={(page) => onPaginationChange({ ...pagination, page })}
          onPageSizeChange={(pageSize) =>
            onPaginationChange({ ...pagination, pageSize, page: undefined })
          }
          onScopeChange={(scope) =>
            onFiltersChange({ ...filters, q: undefined, scope })
          }
          onReload={projects.reload}
        />
      </main>
    </div>
  );
}
