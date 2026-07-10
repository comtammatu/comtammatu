UPDATE public.inventory_locations AS location
SET name = 'Kho chi nhánh'
FROM public.branches AS branch
WHERE location.branch_id = branch.id
  AND branch.branch_kind = 'branch'
  AND location.location_kind = 'warehouse'
  AND location.name = 'Kho CN';

UPDATE public.inventory_locations AS location
SET name = 'Bếp chi nhánh'
FROM public.branches AS branch
WHERE location.branch_id = branch.id
  AND branch.branch_kind = 'branch'
  AND location.location_kind = 'kitchen'
  AND location.name = 'Bếp CN';
