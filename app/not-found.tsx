import { NotFoundContent } from "@/components/ui/not-found-content";

// 組み立ての時の題と説明は組み立ての言語 (日本語)。画面の言葉と切り替えた時の題は NotFoundContent が持つ (spec 31 D7)
export const metadata = {
  title: "ページが見つかりません", // i18n-allow: 組み立ての時の題
  description: "お探しのページは存在しません。", // i18n-allow: 組み立ての時の説明
};

const NotFound = () => <NotFoundContent />;

export default NotFound;
