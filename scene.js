import { bootstrap_engine } from './main.js';			// program wrapper
import { v3f, v4f, q4f, m4f, m3f } from './algebra.js';	// geometric algebras
import { io } 	from './io.js';							// importing/exporting, etc.
import { gfx } 	from './gfx.js';						// general graphics purposes
import { shader } from './shaders.js';					// default shaders
import { primitives } from './mesh.js';					// simple meshes

window.addEventListener("load", (event)=> { bootstrap_engine(sketch); });

const sketch = {
	load: async(self, props)=> {
		const width = 800;
		const height = 600;
// appending a webgpu canvas to the center view tree element.
		props.wgpu = await props.createWebGPUCanvas(width,height, "WebGPU");
		props.c2d = await props.create2DCanvas(width,height,"C2D");
		props.g2d = props.c2d.g2d;
// reposition the canvases into the center of the document
		const canvas_wgpu = props.wgpu.ctx.canvas;
		const canvas_c2d  = props.c2d.ctx.canvas;
		const center_view = document.getElementById("center_view");

		if(center_view) { 
			center_view.appendChild(canvas_wgpu);
			canvas_c2d.style.position = 'absolute';
			center_view.appendChild(canvas_c2d);
		}
	},
	start:async(self, props)=> {
		const wgpu 		= props.wgpu; 		// webgpu package
		const g2d		= props.g2d;
		const ctx 		= wgpu.ctx;	  		// webgpu context
		const canvas	= ctx.canvas;		// drawing canvas

		const device 	= wgpu.device;		// GPU device
		const queue		= device.queue;		// draw call queue

// create a double buffer that we will use for the sketch:
		props.swapchain = gfx.createSwapchain(ctx.getCurrentTexture(), device, wgpu.format);

		props.mdl_m = m4f.identity();								// model matrix
		props.ivm_m = m4f.identity();								// inverse view matrix
		props.prj_m = gfx.perspective(g2d.width(), g2d.height());	// projective matrix

		props.mdl_bf = device.createBuffer({ // model matrix
			label: "Model Matrix",
			size: props.mdl_m.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		}); queue.writeBuffer(props.mdl_bf, 0, props.mdl_m);

		props.ivm_bf = device.createBuffer({ // inverse view matrix
			label: "Inverse View Matrix",
			size: props.ivm_m.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		}); queue.writeBuffer(props.ivm_bf, 0, props.ivm_m);

		props.prj_bf = device.createBuffer({ // projection matrix
			label: "Projection Matrix",
			size: props.prj_m.byteLength,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		}); queue.writeBuffer(props.prj_bf, 0, props.prj_m);

		props.cube = primitives.cube();
		props.vbuffer = device.createBuffer({
			label: "Vertex Buffer",
			size: props.cube.v_buffer.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		}); queue.writeBuffer(props.vbuffer, 0, props.cube.v_buffer);

		props.tbuffer = device.createBuffer({
			label: "Index Buffer",
			size: props.cube.t_buffer.byteLength,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
		}); queue.writeBuffer(props.tbuffer, 0, props.cube.t_buffer);


		props.vs_module = device.createShaderModule({
			label: "Vertex Shader", code: shader.vs_code,
		});
	
		props.fs_module = device.createShaderModule({
			label: "Fragment Shader", code: shader.fs_code,
		});

		props.bg_layout = device.createBindGroupLayout({
			label: "Bind Group Layout",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {} }, 
				{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: {} },
				{ binding: 2, visibility: GPUShaderStage.VERTEX, buffer: {} }
			]
		});

		props.bgroup = device.createBindGroup({
			label: "Bind Group",
			layout: props.bg_layout,
			entries: [
				{ binding: 0, resource: { buffer: props.mdl_bf } }, // model matrix
				{ binding: 1, resource: { buffer: props.ivm_bf } }, // inverse view matrix
				{ binding: 2, resource: { buffer: props.prj_bf } }, // projective matrix
			],
		});
		
		props.vb_layout = {
			arrayStride: 24,			// 6 floats, 4 bytes each
			attributes: [{
				format: "float32x3",
				offset: 0,				// where in the vertex do we look
				shaderLocation: 0		// what attribute this maps to
			}, {
				format: "float32x3",
				offset: 12,
				shaderLocation: 1
			}],
		};

		props.r_layout = device.createPipelineLayout({
			label: "Render Pipeline Layout", bindGroupLayouts: [ props.bg_layout ]
		});

		const cformat = props.swapchain.format;
		props.r_pipe = device.createRenderPipeline({
			label: "Render Pipeline", layout: props.r_layout,
			depthStencil: {
				depthWriteEnabled: true,
				depthCompare: "less",
				format: "depth24plus",
			},
			vertex:   { module: props.vs_module, entryPoint: "vmain", buffers: [ props.vb_layout ] },
			fragment: { module: props.fs_module, entryPoint: "fmain", targets: [ { format: cformat } ] },
		});
	},
	pulse:(self, props)=> {
		const dt = props.deltaTime() / 1000;
		const et = props.elapsedTime() / 1000;

		const g2d = props.g2d;
		const mat = m3f.shift(v3f.vec(g2d.width()/2,g2d.height()/2,1));

		g2d.set_transform(mat);
		g2d.refresh();
		g2d.clear();
		g2d.aliasing(true);

		self.draw(self, props);
	},
	draw:(self, props)=> {
		const wgpu 		= props.wgpu; 		// webgpu package
		const ctx 		= wgpu.ctx;	  		// webgpu context
		const device 	= wgpu.device;		// GPU device
		const queue		= device.queue;		// draw call queue
		const swchain	= props.swapchain;	// swapchain

		props.mdl_m = m4f.stack(
			m4f.shift(v4f.vec(0,0,-8,1)),
			m4f.roty(props.elapsedTime()/1000),
			m4f.rotz(props.elapsedTime()/1000),
			m4f.rotx(props.elapsedTime()/1000),
		);

		queue.writeBuffer(props.mdl_bf, 0, props.mdl_m);

// it turns out that every redraw causes webgpu's framebuffer texture to change. We'll
// redirect our output to the new one every frame
		swchain.refresh(ctx.getCurrentTexture());
/* DRAW CALLS BEGIN */

// encodes draw calls to gpu queue before submission
		const encoder = device.createCommandEncoder();
// empty the buffered texture before drawing anything
		swchain.clear(encoder, (pass) => {
			pass.setPipeline(props.r_pipe);
			pass.setBindGroup(0, props.bgroup);
			pass.setVertexBuffer(0, props.vbuffer);
			pass.setIndexBuffer(props.tbuffer, "uint16");
			pass.drawIndexed(props.cube.t_buffer.length);
		}, 0, 0, .2, 1);

		swchain.flush(ctx, encoder);
/* DRAW CALLS END */
// tell queue to actually process its render passes and commands
		queue.submit([encoder.finish()]);
	}
}
