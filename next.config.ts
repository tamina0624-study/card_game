import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next start`はpublic/配下のファイル一覧を起動時に一度だけスキャンするため、
  // 起動後にアップロードされた画像は静的配信の対象外(404)になる。
  // 起動時点で存在しないファイルへのリクエストのみ、動的に配信するRoute Handlerへ
  // 転送する(既存の静的ファイルは従来通りNext.jsが直接配信するため対象外)。
  async rewrites() {
    return [
      {
        source: "/uploads/characters/:filename",
        destination: "/api/uploads/characters/:filename",
      },
    ];
  },
};

export default nextConfig;
