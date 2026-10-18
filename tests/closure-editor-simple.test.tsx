// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClosureEditor from '../src/components/ClosureEditor';
import type { Closure, Drawing } from '../shared/types';
import { setLanguage } from '../src/lib/language';
const calls = vi.hoisted(() => ({ send: vi.fn(), photo: vi.fn() }));
vi.mock('../src/lib/api', () => ({ send: calls.send }));
vi.mock('../src/lib/images', () => ({ fileToPhotoDataUrl: calls.photo }));
const drawing: Drawing = {kind:'line',coordinates:[[73.04,33.7],[73.041,33.7]],widthMeters:14};
const geometry = {type:'Polygon',coordinates:[[[73.04,33.7],[73.041,33.7],[73.041,33.701],[73.04,33.7]]]};
function setup(overrides: Record<string, unknown> = {}) {
  const save = vi.fn(async () => {}), start = vi.fn();
  const props = {closure:null,drawing,onDraw:vi.fn(),mode:'road' as const,setMode:vi.fn(),onSave:save,onCancel:vi.fn(),onStartRoad:start,...overrides};
  const ui = render(<ClosureEditor {...props} />);
  fireEvent.change(screen.getByLabelText('Road / place'),{target:{value:'Park Road'}});
  return {save,start,ui,props};
}
beforeEach(()=> { setLanguage('en'); calls.send.mockReset().mockResolvedValue(geometry); calls.photo.mockReset().mockResolvedValue('data:image/jpeg;base64,cGhvdG8='); });
afterEach(cleanup);
it('presents one road picker without drawing modes, width controls or finish actions',()=>{
  const {start}=setup();
  for(const name of ['Point','Draw','Area','Road section','Finish drawing','Resume drawing']) expect(screen.queryByRole('button',{name})).toBeNull();
  expect(screen.queryByRole('slider')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Change road'})); expect(start).toHaveBeenCalledOnce();
});
it('does not submit a road-less report',()=>{
  const {save}=setup({drawing:{...drawing,coordinates:[]},canPublish:false});
  expect((screen.getByRole('button',{name:'Submit for review'}) as HTMLButtonElement).disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});
it('requires both road endpoints for a newly picked road closure and offers only the two clear types',()=>{
  const onTypeChange=vi.fn();
  const roadSelection={anchors:[[73.04,33.7]],busy:false,error:'',distanceMeters:20,roadNames:['Park Road'],choose:vi.fn(),reset:vi.fn()};
  const {ui,props}=setup({selectionChanged:true,roadSelection,onTypeChange,restrictionType:'road_closure'});
  expect((screen.getByRole('button',{name:'Add closure'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Select the end on the same road')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Blockade'})); expect(onTypeChange).toHaveBeenCalledWith('blockade');
  ui.rerender(<ClosureEditor {...props} selectionChanged roadSelection={{...roadSelection,anchors:drawing.coordinates}} />);
  expect((screen.getByRole('button',{name:'Add closure'}) as HTMLButtonElement).disabled).toBe(false);
  ui.rerender(<ClosureEditor {...props} mode="browse" selectionChanged roadSelection={{...roadSelection,anchors:[]}} />);
  expect((screen.getByRole('button',{name:'Add closure'}) as HTMLButtonElement).disabled).toBe(false);
});
it('saves a blockade as its exact short drawn line with an explicit type',async()=>{
  const barrier:Drawing={kind:'line',coordinates:[[73.04,33.7],[73.0401,33.7]],widthMeters:4};
  const {save,ui}=setup({drawing:barrier,restrictionType:'blockade',selectionChanged:true,roadSelection:{anchors:barrier.coordinates,busy:false,error:'',distanceMeters:9,roadNames:['Park Road'],choose:vi.fn(),reset:vi.fn()}});
  fireEvent.submit(ui.container.querySelector('form')!); await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({restrictionType:'blockade',drawing:barrier})]);
});
it('submits an ordinary report as a draft and accepts an unknown end',async()=>{
  const {save,ui}=setup({canPublish:false});
  fireEvent.click(screen.getByLabelText('End time unknown'));
  fireEvent.submit(ui.container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0]).toEqual([expect.objectContaining({status:'draft',endsAt:null,title:'Park Road',drawing})]);
});
it('publishes a verified new closure and preserves existing draft status on edits',async()=>{
  const first=setup(); fireEvent.submit(first.ui.container.querySelector('form')!);
  await waitFor(()=>expect(first.save).toHaveBeenCalledOnce());
  expect(first.save.mock.calls[0]).toEqual([expect.objectContaining({status:'published'})]);
  cleanup();
  const saved={title:'Private road',description:'',reason:'other',startsAt:new Date().toISOString(),endsAt:null,status:'draft',drawing,geometry} as Closure;
  const second=setup({closure:saved}); fireEvent.submit(second.ui.container.querySelector('form')!);
  await waitFor(()=>expect(second.save).toHaveBeenCalledOnce());
  expect(second.save.mock.calls[0]).toEqual([expect.objectContaining({status:'draft',drawing})]);
});
it('allows six photos and includes them all in the report',async()=>{
  const {save,ui}=setup({canPublish:false});
  fireEvent.change(screen.getByLabelText('Closure photos'),{target:{files:Array.from({length:6},(_,i)=>new File(['x'],`${i}.jpg`,{type:'image/jpeg'}))}});
  await waitFor(()=>expect(screen.getAllByAltText(/Closure photo/)).toHaveLength(6));
  fireEvent.submit(ui.container.querySelector('form')!);
  await waitFor(()=>expect(save).toHaveBeenCalledOnce());
  expect((save.mock.calls[0] as unknown as [Closure])[0].photos).toHaveLength(6);
});
it('rejects seven photos without decoding them',async()=>{
  setup();
  fireEvent.change(screen.getByLabelText('Closure photos'),{target:{files:Array.from({length:7},()=>new File(['x'],'photo.jpg',{type:'image/jpeg'}))}});
  await screen.findByText('Add up to six photos.'); expect(calls.photo).not.toHaveBeenCalled();
});
it('rejects a combined photo payload larger than the shared storage budget',async()=>{
  calls.photo.mockResolvedValue('x'.repeat(140000)); setup();
  fireEvent.change(screen.getByLabelText('Closure photos'),{target:{files:Array.from({length:6},()=>new File(['x'],'photo.jpg',{type:'image/jpeg'}))}});
  await screen.findByText('Photos are too large together. Choose smaller photos.');
  expect(screen.queryByAltText('Closure photo 1')).toBeNull();
});
it('does not save if the road changes while its polygon is being prepared',async()=>{
  let finish:(value:unknown)=>void=()=>{}; calls.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const {save,props,ui}=setup(); fireEvent.submit(ui.container.querySelector('form')!);
  ui.rerender(<ClosureEditor {...props} drawing={{...drawing,coordinates:[[73.04,33.7],[73.042,33.7]]}} />);
  finish(geometry); await screen.findByText('The road selection changed. Save again.'); expect(save).not.toHaveBeenCalled();
});
