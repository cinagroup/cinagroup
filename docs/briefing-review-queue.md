# Briefing review queue

> **Status change, 2026-11-14: this list no longer blocks production.** Following an owner
> decision, automated briefings publish without a human editorial review gate. The
> `Require reviewed briefing content before production changes` deploy step and
> `scripts/verify-briefing-release.mjs` were removed, so deploy and cutover no longer fail
> closed on pending rows here. Context: the gate was working as designed — every one of the
> 30 briefings accumulated since baseline `a95006c1` was still `pending` — and that design
> meant no briefing could reach production until a human approved 30 back issues. The
> decision was to drop the gate rather than freeze publishing.
>
> This file is kept as a **triage reference**, not a release precondition. The rows below
> record which briefings have been reviewed and which have not. Treating an unreviewed
> briefing as verified is still wrong: the automated workflow marks these `archived_unverified`
> / `verification.status: unverified` precisely because no independent editorial pass happened.

The 28 briefing files added after commit `5de80389` and through `eea3f66a` were deployed by explicit authorization before completing source and editorial review. All entries below remain pending and still require review. The release baseline is `a95006c1`, the source revision previously deployed on 2026-10-31.

To record a real editorial review, replace that row's pending status with `approved; sha256=<full lowercase file SHA-256>; reviewer=<reviewer-id>; reviewed=YYYY-MM-DD`. The hash must match the exact current source bytes; a subsequent change invalidates the approval. An approval record is not a substitute for checking the cited claims — nothing in the build or deploy pipeline enforces this any more, so the record is only as trustworthy as the reviewer who wrote it.

URL counts are a triage aid only: a URL is not evidence that a claim is correct, current, or supported by that page. Review every material claim against its original source, verify the publication time and attribution, and record the reviewer and decision. Entries without citations require source discovery. Preserve the archive governance and review process in `content-governance.md`.

| Briefing                                                                                | URLs in source | Review                                                          |
| --------------------------------------------------------------------------------------- | -------------: | --------------------------------------------------------------- |
| [ai-news-briefing-2026-10-17-18.md](../src/data/post/ai-news-briefing-2026-10-17-18.md) |              0 | [Preliminary review](briefing-review-2026-10-17-18.md); pending |
| [ai-news-briefing-2026-10-18-06.md](../src/data/post/ai-news-briefing-2026-10-18-06.md) |              8 | [Preliminary review](briefing-review-2026-10-18-06.md); pending |
| [ai-news-briefing-2026-10-18-18.md](../src/data/post/ai-news-briefing-2026-10-18-18.md) |             14 | [Preliminary review](briefing-review-2026-10-18-18.md); pending |
| [ai-news-briefing-2026-10-19-06.md](../src/data/post/ai-news-briefing-2026-10-19-06.md) |              0 | [Preliminary review](briefing-review-2026-10-19-06.md); pending |
| [ai-news-briefing-2026-10-19-18.md](../src/data/post/ai-news-briefing-2026-10-19-18.md) |              0 | [Preliminary review](briefing-review-2026-10-19-18.md); pending |
| [ai-news-briefing-2026-10-20-06.md](../src/data/post/ai-news-briefing-2026-10-20-06.md) |              8 | [Preliminary review](briefing-review-2026-10-20-06.md); pending |
| [ai-news-briefing-2026-10-20-18.md](../src/data/post/ai-news-briefing-2026-10-20-18.md) |              0 | [Preliminary review](briefing-review-2026-10-20-18.md); pending |
| [ai-news-briefing-2026-10-21-06.md](../src/data/post/ai-news-briefing-2026-10-21-06.md) |              7 | [Preliminary review](briefing-review-2026-10-21-06.md); pending |
| [ai-news-briefing-2026-10-21-18.md](../src/data/post/ai-news-briefing-2026-10-21-18.md) |              0 | [Preliminary review](briefing-review-2026-10-21-18.md); pending |
| [ai-news-briefing-2026-10-22-06.md](../src/data/post/ai-news-briefing-2026-10-22-06.md) |              0 | [Preliminary review](briefing-review-2026-10-22-06.md); pending |
| [ai-news-briefing-2026-10-22-18.md](../src/data/post/ai-news-briefing-2026-10-22-18.md) |             13 | [Preliminary review](briefing-review-2026-10-22-18.md); pending |
| [ai-news-briefing-2026-10-23-06.md](../src/data/post/ai-news-briefing-2026-10-23-06.md) |             11 | [Preliminary review](briefing-review-2026-10-23-06.md); pending |
| [ai-news-briefing-2026-10-23-18.md](../src/data/post/ai-news-briefing-2026-10-23-18.md) |              7 | [Preliminary review](briefing-review-2026-10-23-18.md); pending |
| [ai-news-briefing-2026-10-24-06.md](../src/data/post/ai-news-briefing-2026-10-24-06.md) |             10 | [Preliminary review](briefing-review-2026-10-24-06.md); pending |
| [ai-news-briefing-2026-10-24-18.md](../src/data/post/ai-news-briefing-2026-10-24-18.md) |              7 | [Preliminary review](briefing-review-2026-10-24-18.md); pending |
| [ai-news-briefing-2026-10-25-06.md](../src/data/post/ai-news-briefing-2026-10-25-06.md) |             14 | [Preliminary review](briefing-review-2026-10-25-06.md); pending |
| [ai-news-briefing-2026-10-25-18.md](../src/data/post/ai-news-briefing-2026-10-25-18.md) |              0 | [Preliminary review](briefing-review-2026-10-25-18.md); pending |
| [ai-news-briefing-2026-10-26-06.md](../src/data/post/ai-news-briefing-2026-10-26-06.md) |             10 | [Preliminary review](briefing-review-2026-10-26-06.md); pending |
| [ai-news-briefing-2026-10-26-18.md](../src/data/post/ai-news-briefing-2026-10-26-18.md) |              8 | [Preliminary review](briefing-review-2026-10-26-18.md); pending |
| [ai-news-briefing-2026-10-27-06.md](../src/data/post/ai-news-briefing-2026-10-27-06.md) |              0 | [Preliminary review](briefing-review-2026-10-27-06.md); pending |
| [ai-news-briefing-2026-10-27-18.md](../src/data/post/ai-news-briefing-2026-10-27-18.md) |              0 | [Preliminary review](briefing-review-2026-10-27-18.md); pending |
| [ai-news-briefing-2026-10-28-06.md](../src/data/post/ai-news-briefing-2026-10-28-06.md) |              9 | [Preliminary review](briefing-review-2026-10-28-06.md); pending |
| [ai-news-briefing-2026-10-28-18.md](../src/data/post/ai-news-briefing-2026-10-28-18.md) |             13 | [Preliminary review](briefing-review-2026-10-28-18.md); pending |
| [ai-news-briefing-2026-10-29-06.md](../src/data/post/ai-news-briefing-2026-10-29-06.md) |              8 | [Preliminary review](briefing-review-2026-10-29-06.md); pending |
| [ai-news-briefing-2026-10-29-18.md](../src/data/post/ai-news-briefing-2026-10-29-18.md) |              0 | [Preliminary review](briefing-review-2026-10-29-18.md); pending |
| [ai-news-briefing-2026-10-30-06.md](../src/data/post/ai-news-briefing-2026-10-30-06.md) |              9 | [Preliminary review](briefing-review-2026-10-30-06.md); pending |
| [ai-news-briefing-2026-10-30-18.md](../src/data/post/ai-news-briefing-2026-10-30-18.md) |             10 | [Preliminary review](briefing-review-2026-10-30-18.md); pending |
| [ai-news-briefing-2026-10-31-06.md](../src/data/post/ai-news-briefing-2026-10-31-06.md) |              0 | [Preliminary review](briefing-review-2026-10-31-06.md); pending |

Do not treat this queue or the presence of a URL as a fact-check. The already deployed pending briefings remain unverified; newly added or modified briefings require review before production deployment.
