"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, DropdownSelect } from "@/components/Common";
import type { DropdownOption } from "@/components/Common";
import { APP_ROUTES } from "@/constants/routes";

type TourSetupFormProps = {
  colleges: DropdownOption[];
  languages: DropdownOption[];
  initialCollege?: string;
  initialLanguage?: string;
};

export function TourSetupForm({
  colleges,
  languages,
  initialCollege = colleges[1]?.value ?? "",
  initialLanguage = languages[0]?.value ?? "",
}: TourSetupFormProps) {
  const router = useRouter();
  const [college, setCollege] = useState(initialCollege);
  const [language, setLanguage] = useState(initialLanguage);

  const canStart = useMemo(() => Boolean(college && language), [college, language]);

  function handleStartTour() {
    if (!canStart) {
      return;
    }

    // college label(한국어 단과대명)을 URL query로 전달
    const selectedCollege = colleges.find((c) => c.value === college);
    const collegeName = selectedCollege?.label ?? college;
    router.push(`${APP_ROUTES.tour}?theme=${encodeURIComponent(collegeName)}`);
  }

  return (
    <form
      className="flex min-h-dvh flex-col bg-surface px-6 pb-[calc(28px+env(safe-area-inset-bottom))] pt-[66px]"
      onSubmit={(event) => {
        event.preventDefault();
        handleStartTour();
      }}
    >
      <main className="flex-1">
        <section>
          <h1 className="text-[25px] font-extrabold leading-8 text-ink">맞춤 투어 설정</h1>
          <p className="mt-3 text-[14px] font-medium leading-[22px] text-muted">
            소속 단과대학과 사용 언어를 선택하면
            <br />
            맞춤형 캠퍼스 투어를 시작합니다.
          </p>
        </section>

        <section className="mt-6 space-y-5">
          <DropdownSelect
            label="소속 단과대학"
            value={college}
            options={colleges}
            onChange={setCollege}
          />
          <DropdownSelect
            label="사용 언어"
            value={language}
            options={languages}
            onChange={setLanguage}
          />
        </section>
      </main>

      <Button type="submit" size="lg" fullWidth disabled={!canStart}>
        맞춤형 투어 시작하기
      </Button>
    </form>
  );
}
