import { useCallback, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FileBox,
  FolderOpen,
  ListFilter,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ModelFile,
  Project,
  ProjectPage,
  ProjectSort,
  SortDirection,
} from "../../api";
import { revealInFileManager } from "../../api";
import {
  describeCreatedSource,
  formatBytes,
  formatDateTime,
  formatRelative,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PAGE_SIZES = [25, 50, 100, 200];

export interface ProjectsTableProps {
  /** Undefined until the first response arrives. */
  page?: ProjectPage;
  loading: boolean;
  /** True while cached data is being revalidated in the background. */
  validating?: boolean;
  error?: string;
  /** Page asked for in the URL, only a hint while a request is in flight. */
  currentPage?: number;
  /** Page size asked for in the URL, only a hint while a request is in flight. */
  pageSize?: number;
  sort?: ProjectSort;
  dir?: SortDirection;
  /** Search text, used for the empty state message. */
  search?: string;
  onSortChange: (sort: ProjectSort, dir: SortDirection) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onScopeChange: (scope: string) => void;
  onReload: () => void;
}

/** Column header that asks the page for a new sort order. */
function SortableHeader({
  label,
  columnId,
  sort,
  dir,
  onSortChange,
}: {
  label: string;
  columnId: ProjectSort;
  sort?: ProjectSort;
  dir?: SortDirection;
  onSortChange: (sort: ProjectSort, dir: SortDirection) => void;
}) {
  const active = sort === columnId;
  const nextDirection: SortDirection = active && dir === "asc" ? "desc" : "asc";

  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 gap-1 px-2 text-xs font-medium"
      onClick={() => onSortChange(columnId, nextDirection)}
    >
      {label}
      {active && dir === "asc" ? (
        <ArrowUp className="size-3" />
      ) : active ? (
        <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </Button>
  );
}

/** One model file of a project; clicking it reveals the file in the OS. */
function ModelChip({
  model,
  onReveal,
}: {
  model: ModelFile;
  onReveal: (model: ModelFile) => void;
}) {
  const label =
    model.name.length > 22 ? `${model.name.slice(0, 20)}…` : model.name;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onReveal(model)}
          className="inline-flex max-w-[190px] items-center gap-1 rounded-md border border-border/70 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
        >
          <FileBox className="size-3 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-mono text-[11px] break-all">{model.name}</p>
        <p className="text-[11px] opacity-80">
          {formatBytes(model.bytes)} · modified{" "}
          {formatDateTime(model.modifiedAt)}
        </p>
        <p className="mt-1 text-[11px] opacity-60">
          Click to reveal the file in your file manager.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Paginated project table. Sorting, paging and filtering live in the URL. */
export function ProjectsTable({
  page,
  loading,
  validating,
  error,
  currentPage,
  pageSize,
  sort,
  dir,
  search,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onScopeChange,
  onReload,
}: ProjectsTableProps) {
  const [revealPending, setRevealPending] = useState<string>();

  const handleReveal = useCallback(
    async (
      body: { projectId?: number; relPath?: string; selectFile?: boolean },
      key: string,
    ) => {
      setRevealPending(key);
      try {
        const result = await revealInFileManager(body);
        toast.success("Opened in the system file manager", {
          description: result.target,
        });
      } catch (cause) {
        toast.error("Could not open the file manager", {
          description: (cause as Error).message,
        });
      } finally {
        setRevealPending(undefined);
      }
    },
    [],
  );

  const columns = useMemo<ColumnDef<Project>[]>(
    () => [
      {
        id: "category",
        accessorKey: "category",
        header: () => (
          <SortableHeader
            label="Category"
            columnId="category"
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
          />
        ),
        cell: ({ row }) => (
          <Badge
            variant="secondary"
            className="max-w-[160px] truncate font-normal"
          >
            {row.original.category}
          </Badge>
        ),
      },
      {
        id: "name",
        accessorKey: "name",
        header: () => (
          <SortableHeader
            label="Project"
            columnId="name"
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
          />
        ),
        cell: ({ row }) => (
          <div className="max-w-[320px] min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {row.original.relPath || "."}
            </p>
          </div>
        ),
      },
      {
        id: "models",
        header: () => (
          <span className="px-2 text-xs font-medium">Model files</span>
        ),
        enableSorting: false,
        cell: ({ row }) => {
          const { models } = row.original;
          return (
            <div className="flex flex-wrap items-center gap-1">
              <Badge variant="outline" className="tabular-nums">
                {row.original.modelCount}
              </Badge>
              {models.slice(0, 2).map((model) => (
                <ModelChip
                  key={model.relPath}
                  model={model}
                  onReveal={(file) =>
                    void handleReveal(
                      {
                        projectId: row.original.id,
                        relPath: file.relPath,
                        selectFile: true,
                      },
                      file.relPath,
                    )
                  }
                />
              ))}
              {models.length > 2 ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-[11px] text-muted-foreground">
                      +{models.length - 2}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <ul className="space-y-0.5 text-[11px]">
                      {models.slice(2).map((model) => (
                        <li key={model.relPath} className="font-mono break-all">
                          {model.name}
                        </li>
                      ))}
                    </ul>
                  </TooltipContent>
                </Tooltip>
              ) : null}
              <span className="text-[11px] text-muted-foreground/70">
                {formatBytes(row.original.modelBytes)}
              </span>
            </div>
          );
        },
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: () => (
          <SortableHeader
            label="Created"
            columnId="createdAt"
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs whitespace-nowrap text-muted-foreground">
                {formatDateTime(row.original.createdAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p>{formatRelative(row.original.createdAt)}</p>
              <p className="text-[11px] opacity-80">
                {describeCreatedSource(row.original.createdSource)}
              </p>
            </TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "modifiedAt",
        accessorKey: "modifiedAt",
        header: () => (
          <SortableHeader
            label="Modified"
            columnId="modifiedAt"
            sort={sort}
            dir={dir}
            onSortChange={onSortChange}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-xs whitespace-nowrap text-muted-foreground">
                {formatDateTime(row.original.modifiedAt)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{formatRelative(row.original.modifiedAt)}</p>
              <p className="text-[11px] opacity-80">
                Newest change among the model files of the project.
              </p>
            </TooltipContent>
          </Tooltip>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        cell: ({ row }) => {
          const project = row.original;
          const key = project.relPath;
          return (
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 px-2"
                    disabled={revealPending === key}
                    onClick={() =>
                      void handleReveal({ projectId: project.id }, key)
                    }
                  >
                    <FolderOpen className="size-3.5" />
                    <span className="hidden xl:inline">Open folder</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Open this project in your operating system file manager
                </TooltipContent>
              </Tooltip>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                  >
                    ⋯
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem
                    onSelect={() =>
                      void handleReveal({ projectId: project.id }, key)
                    }
                  >
                    <FolderOpen className="size-4" />
                    Open folder
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onScopeChange(project.relPath)}
                  >
                    <ListFilter className="size-4" />
                    Filter by this folder
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [dir, sort],
  );

  const table = useReactTable({
    data: page?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    pageCount: page?.pageCount ?? 1,
  });

  // The response is the source of truth for the window that was served: the API
  // resolves its own defaults and clamps out of range pages. The URL values are
  // only a hint while a request is in flight, and they can be undefined.
  const total = page?.total;
  const pageCount = page?.pageCount;
  const effectivePage = page?.page ?? currentPage;
  const effectivePageSize = page?.pageSize ?? pageSize;
  const summary =
    total === undefined ||
    effectivePage === undefined ||
    effectivePageSize === undefined
      ? undefined
      : total === 0
        ? "No results"
        : `${(effectivePage - 1) * effectivePageSize + 1}–${Math.min(total, effectivePage * effectivePageSize)} of ${total.toLocaleString()} projects`;

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card/40">
      {error ? (
        <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs"
            onClick={onReload}
          >
            <RotateCw className="size-3" />
            Retry
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card/95 backdrop-blur">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="whitespace-nowrap">
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading && !page
              ? Array.from({ length: 8 }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    {columns.map((_column, cellIndex) => (
                      <TableCell key={`skeleton-${index}-${cellIndex}`}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="align-middle">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

            {!loading && page !== undefined && page.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {search
                    ? `No project matches "${search}" in this folder.`
                    : "No project found in this folder. Pick another folder in the tree."}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>
          {summary}
          {validating ? " · updating…" : ""}
        </span>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Rows</span>
            <Select
              value={
                effectivePageSize === undefined
                  ? undefined
                  : String(effectivePageSize)
              }
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger size="sm" className="h-7 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                if (effectivePage !== undefined)
                  onPageChange(effectivePage - 1);
              }}
              disabled={effectivePage === undefined || effectivePage <= 1}
            >
              <ChevronLeft className="size-3.5" />
              <span className="sr-only">Previous page</span>
            </Button>
            <span className="tabular-nums">
              {effectivePage ?? "–"} / {pageCount ?? "–"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                if (effectivePage !== undefined)
                  onPageChange(effectivePage + 1);
              }}
              disabled={
                effectivePage === undefined ||
                pageCount === undefined ||
                effectivePage >= pageCount
              }
            >
              <ChevronRight className="size-3.5" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
