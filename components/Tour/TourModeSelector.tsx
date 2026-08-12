import type { TourCourse } from "@/types";
import { TourCourseCard } from "./TourCourseCard";

type TourModeSelectorProps = {
  courses: TourCourse[];
};

export function TourModeSelector({ courses }: TourModeSelectorProps) {
  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-primary">Orientation</p>
        <h2 className="mt-1 text-2xl font-bold text-ink">Recommended courses</h2>
      </div>
      <div className="grid gap-3">
        {courses.map((course) => (
          <TourCourseCard key={course.id} course={course} />
        ))}
      </div>
    </section>
  );
}
