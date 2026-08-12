import type { TourCourse } from "@/types";

type TourCourseCardProps = {
  course: TourCourse;
};

export function TourCourseCard({ course }: TourCourseCardProps) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">{course.title}</h3>
          <p className="mt-1 text-sm text-muted">{course.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1 text-xs font-semibold text-primary">
          {course.durationMinutes}m
        </span>
      </div>
    </article>
  );
}
