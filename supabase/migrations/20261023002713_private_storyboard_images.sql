-- Private immutable image objects. Individual files remain <=5 MiB; the full
-- storyboard can contain many images without embedding them in its JSON row.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('storyboard-images','storyboard-images',false,5242880,array['image/png','image/jpeg','image/webp','image/gif']);

create function app_private.storyboard_image_role(object_name text) returns text
language sql stable security definer set search_path = '' as $$
 select app_private.project_role(s.project_id)
 from public.storyboards s
 where s.id::text=split_part(object_name,'/',2)
   and s.project_id::text=split_part(object_name,'/',1)
   and object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp|gif)$'
$$;
revoke all on function app_private.storyboard_image_role(text) from public,anon;
grant execute on function app_private.storyboard_image_role(text) to authenticated;
create policy storyboard_image_read on storage.objects for select to authenticated
using(bucket_id='storyboard-images' and app_private.storyboard_image_role(name) is not null);
create policy storyboard_image_insert on storage.objects for insert to authenticated
with check(bucket_id='storyboard-images' and app_private.storyboard_image_role(name) in ('owner','editor'));
-- No update/delete policies: content-addressed files cannot be overwritten or
-- removed while another revision/tab may still reference them. Unlinking an image
-- changes the document; orphan cleanup requires a separately reviewed process.

create function app_private.validate_storyboard_images() returns trigger
language plpgsql security definer set search_path = '' as $$
declare shot jsonb; image_path text;
begin
 for shot in select value from jsonb_array_elements(new.document->'shots') loop
   if shot ? 'imagePath' then
     image_path := shot->>'imagePath';
     if image_path is null or image_path not like new.project_id::text||'/'||new.id::text||'/%'
       or image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp|gif)$'
       or not exists(select 1 from storage.objects where bucket_id='storyboard-images' and name=image_path) then
       raise exception 'An image is missing or does not belong to this storyboard. Retry its upload before saving.' using errcode='23514';
     end if;
   end if;
 end loop;
 return new;
end $$;
revoke all on function app_private.validate_storyboard_images() from public,anon,authenticated;
create trigger validate_storyboard_images before insert or update of document on public.storyboards
for each row execute function app_private.validate_storyboard_images();
