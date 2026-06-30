# DGit Message Archives

DGit can optionally collect Discord message history into separate `message-archive-<hash>.json.gz` files. Message archives are not embedded in snapshots, and older commits without archives remain valid.

## Commands

- `/dgit-admin message-backup enable|disable`: turn message backup collection on or off.
- `/dgit-admin message-backup status`: show current message backup settings.
- `/dgit-admin message-backup restore-mode mode:<mode>`: set the default message restore mode, or `none`.
- `/dgit-admin message-backup include-channel channel:#channel`: collect only the selected channel list.
- `/dgit-admin message-backup exclude-channel channel:#channel`: skip the selected channel list.
- `/dgit-admin message-backup clear-channels`: clear include/exclude filters.
- `/dgit restore commit:<ref> message-mode:<mode>`: preview restore with an explicit message archive mode.
- `/dgit-repo archive-info commit:<ref>`: show archive metadata without printing message content.
- `/dgit-repo export-message-archive commit:<ref>`: export the archive as a gzip JSON file.

## Restore Modes

- `structureOnly`: restore server structure only. Message archives are ignored for execution.
- `archiveOnly`: prepare/export the archive. It does not send messages to Discord channels.
- `renderAsAppMessages`: creates new bot-authored archival messages that represent old records. These are not original Discord messages.

Rendered archive messages have new Discord message IDs, new actual creation times, and the bot/application sender identity. Original author display names, message IDs, and timestamps are archival metadata only. DGit does not impersonate users.

## Privacy and Permissions

Message archives can contain sensitive message content. Message backup configuration, archive export, archive info, and `renderAsAppMessages` restore previews require Administrator permission through the existing command guards. Do not share exported archive files with unauthorized users.

## Limitations

- Deleted Discord messages cannot be recreated as the original messages.
- Original message IDs and actual Discord creation timestamps cannot be preserved.
- Existing live channel history is not deleted, overwritten, or cleaned up.
- Re-running a render plan can duplicate archival output.
- Inaccessible/private/unsupported channels are skipped safely.
- Attachments are currently represented by archived metadata and hashes during rendering; files are not reuploaded unless a future storage path provides attachment bytes.
- Rendering is sequential to reduce rate-limit pressure, but large archives may still be rate-limited.
- If message content was unavailable at collection time, render output shows `[content unavailable]`.
